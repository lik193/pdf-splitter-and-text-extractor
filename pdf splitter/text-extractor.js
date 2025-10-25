// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Global variables
let pdfFile = null;
let pdfDoc = null;
let totalPages = 0;
let extractedText = '';

// DOM elements
const uploadBox = document.getElementById('uploadBox');
const pdfInput = document.getElementById('pdfInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const filePages = document.getElementById('filePages');
const removeFile = document.getElementById('removeFile');
const optionsSection = document.getElementById('optionsSection');
const actionSection = document.getElementById('actionSection');
const progressSection = document.getElementById('progressSection');
const previewSection = document.getElementById('previewSection');
const useOCR = document.getElementById('useOCR');
const twoColumn = document.getElementById('twoColumn');
const marginCrop = document.getElementById('marginCrop');
const marginValue = document.getElementById('marginValue');
const extractBtn = document.getElementById('extractBtn');
const extractedTextArea = document.getElementById('extractedText');
const textStats = document.getElementById('textStats');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// Event listeners
uploadBox.addEventListener('click', () => pdfInput.click());
pdfInput.addEventListener('change', handleFileSelect);
removeFile.addEventListener('click', resetApp);
extractBtn.addEventListener('click', extractText);
copyBtn.addEventListener('click', copyText);
downloadBtn.addEventListener('click', downloadText);
marginCrop.addEventListener('input', () => {
    marginValue.textContent = `${marginCrop.value}%`;
});

// Drag and drop handlers
uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.classList.add('dragover');
});

uploadBox.addEventListener('dragleave', () => {
    uploadBox.classList.remove('dragover');
});

uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
        pdfInput.files = files;
        handleFileSelect();
    }
});

// Handle file selection
async function handleFileSelect() {
    const file = pdfInput.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        alert('Please select a valid PDF file.');
        return;
    }

    showProgress('Loading PDF...', 30);

    try {
        pdfFile = file;
        const arrayBuffer = await file.arrayBuffer();
        
        showProgress('Processing PDF...', 60);
        
        // Load PDF with PDF.js
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        totalPages = pdfDoc.numPages;

        showProgress('Complete!', 100);
        
        // Update UI
        uploadBox.style.display = 'none';
        fileInfo.style.display = 'flex';
        fileName.textContent = file.name;
        filePages.textContent = `${totalPages} pages`;
        
        optionsSection.style.display = 'block';
        actionSection.style.display = 'block';
        
        // Hide progress after a short delay
        setTimeout(() => {
            progressSection.style.display = 'none';
        }, 500);
        
    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Error loading PDF. Please try another file.');
        resetApp();
    }
}

// Extract text from PDF
async function extractText() {
    extractBtn.disabled = true;
    progressSection.style.display = 'block';
    previewSection.style.display = 'none';
    extractedText = '';
    
    const shouldUseOCR = useOCR.checked;
    
    try {
        showProgress('Extracting text...', 0);
        
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const progress = (pageNum / totalPages) * 90;
            showProgress(`Processing page ${pageNum} of ${totalPages}...`, progress);
            
            const page = await pdfDoc.getPage(pageNum);
            
            // Try to extract text directly first
            const textContent = await page.getTextContent();
            let pageText = textContent.items.map(item => item.str).join(' ');
            
            // If no text found and OCR is enabled, use OCR
            if (shouldUseOCR && (!pageText || pageText.trim().length < 10)) {
                showProgress(`OCR processing page ${pageNum} of ${totalPages}...`, progress);
                pageText = await performOCR(page);
            }
            
            if (pageText.trim()) {
                extractedText += `\n\n--- Page ${pageNum} ---\n\n${pageText.trim()}`;
            }
        }
        
        showProgress('Finalizing...', 95);
        
        // Clean up the text
        extractedText = extractedText.trim();
        
        if (!extractedText) {
            alert('No text could be extracted from this PDF.');
            resetExtraction();
            return;
        }
        
        // Display results
        extractedTextArea.value = extractedText;
        const wordCount = extractedText.split(/\s+/).length;
        const charCount = extractedText.length;
        textStats.textContent = `${wordCount.toLocaleString()} words • ${charCount.toLocaleString()} characters • ${totalPages} pages`;
        
        showProgress('Complete!', 100);
        
        previewSection.style.display = 'block';
        
        setTimeout(() => {
            progressSection.style.display = 'none';
            extractBtn.disabled = false;
        }, 500);
        
    } catch (error) {
        console.error('Error extracting text:', error);
        alert('Error extracting text. Please try again.');
        resetExtraction();
    }
}

// Perform OCR on a PDF page
async function performOCR(page) {
    try {
        // Render page to canvas
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        // Crop margins to remove edge text from adjacent pages
        const cropPercent = parseInt(marginCrop.value) / 100;
        const cropX = canvas.width * cropPercent;
        const cropY = canvas.height * cropPercent;
        const cropWidth = canvas.width * (1 - 2 * cropPercent);
        const cropHeight = canvas.height * (1 - 2 * cropPercent);
        
        // Check if two-column layout is enabled
        if (twoColumn.checked) {
            // Find the column gutter (whitespace between columns)
            const splitX = findColumnGutter(canvas, cropX, cropY, cropWidth, cropHeight);
            
            // Process left column first, then right column
            const leftWidth = splitX - cropX;
            const rightX = splitX;
            const rightWidth = (cropX + cropWidth) - splitX;
            
            const leftText = await processColumn(canvas, cropX, cropY, leftWidth, cropHeight, 'left');
            const rightText = await processColumn(canvas, rightX, cropY, rightWidth, cropHeight, 'right');
            
            return leftText + '\n\n' + rightText;
        } else {
            // Process entire page as single column
            return await processColumn(canvas, cropX, cropY, cropWidth, cropHeight, 'full');
        }
    } catch (error) {
        console.error('OCR error:', error);
        return '';
    }
}

// Find the column gutter (whitespace) between two columns
function findColumnGutter(canvas, startX, startY, width, height) {
    const context = canvas.getContext('2d');
    
    // Define search range (middle 30% of the page)
    const searchStart = startX + width * 0.35;
    const searchEnd = startX + width * 0.65;
    const searchWidth = Math.floor(searchEnd - searchStart);
    
    // Sample vertical strips and count white pixels
    const whitenessScores = [];
    
    for (let x = 0; x < searchWidth; x++) {
        const currentX = Math.floor(searchStart + x);
        let whitePixels = 0;
        const sampleRate = 5; // Sample every 5 pixels vertically for performance
        
        for (let y = startY; y < startY + height; y += sampleRate) {
            const pixel = context.getImageData(currentX, y, 1, 1).data;
            const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
            
            // Consider pixels with brightness > 240 as white
            if (brightness > 240) {
                whitePixels++;
            }
        }
        
        whitenessScores.push({
            x: currentX,
            score: whitePixels
        });
    }
    
    // Find the position with the most white pixels (the gutter)
    let maxScore = 0;
    let gutterX = startX + width / 2; // Default to middle if no clear gutter found
    
    for (const score of whitenessScores) {
        if (score.score > maxScore) {
            maxScore = score.score;
            gutterX = score.x;
        }
    }
    
    return gutterX;
}

// Process a column or section of the page
async function processColumn(sourceCanvas, x, y, width, height, columnName) {
    try {
        // Create a new canvas for this column
        const columnCanvas = document.createElement('canvas');
        const columnContext = columnCanvas.getContext('2d');
        columnCanvas.width = width;
        columnCanvas.height = height;
        
        // Draw the column portion
        columnContext.drawImage(
            sourceCanvas,
            x, y, width, height,  // Source rectangle
            0, 0, width, height   // Destination rectangle
        );
        
        // Convert canvas to image data
        const imageData = columnCanvas.toDataURL('image/png');
        
        // Perform OCR
        const result = await Tesseract.recognize(
            imageData,
            'eng',
            {
                logger: () => {} // Suppress Tesseract logs
            }
        );
        
        return result.data.text.trim();
    } catch (error) {
        console.error(`OCR error for ${columnName} column:`, error);
        return '';
    }
}

// Copy text to clipboard
async function copyText() {
    try {
        // Get the current text from textarea (may have been edited)
        const currentText = extractedTextArea.value;
        await navigator.clipboard.writeText(currentText);
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
        `;
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
        }, 2000);
    } catch (error) {
        console.error('Copy error:', error);
        alert('Failed to copy text. Please select and copy manually.');
    }
}

// Download text as file
function downloadText() {
    // Get the current text from textarea (may have been edited)
    const currentText = extractedTextArea.value;
    const blob = new Blob([currentText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename
    const originalName = pdfFile.name.replace('.pdf', '');
    a.download = `${originalName}_extracted_text.txt`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Show progress
function showProgress(text, percent) {
    progressSection.style.display = 'block';
    progressText.textContent = text;
    progressFill.style.width = `${percent}%`;
}

// Reset extraction (keep file loaded)
function resetExtraction() {
    progressSection.style.display = 'none';
    previewSection.style.display = 'none';
    extractBtn.disabled = false;
    extractedText = '';
}

// Reset application
function resetApp() {
    pdfFile = null;
    pdfDoc = null;
    totalPages = 0;
    extractedText = '';
    pdfInput.value = '';
    
    uploadBox.style.display = 'block';
    fileInfo.style.display = 'none';
    optionsSection.style.display = 'none';
    actionSection.style.display = 'none';
    progressSection.style.display = 'none';
    previewSection.style.display = 'none';
}

