// Global variables
let pdfFile = null;
let pdfDoc = null;
let totalPages = 0;

// DOM elements
const uploadBox = document.getElementById('uploadBox');
const pdfInput = document.getElementById('pdfInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const filePages = document.getElementById('filePages');
const removeFile = document.getElementById('removeFile');
const rangeSection = document.getElementById('rangeSection');
const actionSection = document.getElementById('actionSection');
const progressSection = document.getElementById('progressSection');
const startPageInput = document.getElementById('startPage');
const endPageInput = document.getElementById('endPage');
const rangeInfo = document.getElementById('rangeInfo');
const splitBtn = document.getElementById('splitBtn');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// Event listeners
uploadBox.addEventListener('click', () => pdfInput.click());
pdfInput.addEventListener('change', handleFileSelect);
removeFile.addEventListener('click', resetApp);
startPageInput.addEventListener('input', validateRange);
endPageInput.addEventListener('input', validateRange);
splitBtn.addEventListener('click', splitPDF);

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

    // Show progress
    showProgress('Loading PDF...', 30);

    try {
        pdfFile = file;
        const arrayBuffer = await file.arrayBuffer();
        
        showProgress('Processing PDF...', 60);
        
        // Load PDF with pdf-lib
        pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        totalPages = pdfDoc.getPageCount();

        showProgress('Complete!', 100);
        
        // Update UI
        uploadBox.style.display = 'none';
        fileInfo.style.display = 'flex';
        fileName.textContent = file.name;
        filePages.textContent = `${totalPages} pages`;
        
        // Setup page range inputs
        startPageInput.max = totalPages;
        endPageInput.max = totalPages;
        endPageInput.value = totalPages;
        
        rangeSection.style.display = 'block';
        actionSection.style.display = 'block';
        
        validateRange();
        
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

// Validate page range
function validateRange() {
    const start = parseInt(startPageInput.value);
    const end = parseInt(endPageInput.value);
    
    rangeInfo.classList.remove('error');
    
    if (isNaN(start) || isNaN(end)) {
        rangeInfo.textContent = 'Please enter valid page numbers';
        rangeInfo.classList.add('error');
        splitBtn.disabled = true;
        return;
    }
    
    if (start < 1 || start > totalPages) {
        rangeInfo.textContent = `Start page must be between 1 and ${totalPages}`;
        rangeInfo.classList.add('error');
        splitBtn.disabled = true;
        return;
    }
    
    if (end < 1 || end > totalPages) {
        rangeInfo.textContent = `End page must be between 1 and ${totalPages}`;
        rangeInfo.classList.add('error');
        splitBtn.disabled = true;
        return;
    }
    
    if (start > end) {
        rangeInfo.textContent = 'Start page must be less than or equal to end page';
        rangeInfo.classList.add('error');
        splitBtn.disabled = true;
        return;
    }
    
    const pageCount = end - start + 1;
    rangeInfo.textContent = `✓ Will extract ${pageCount} page${pageCount > 1 ? 's' : ''} (${start}-${end})`;
    splitBtn.disabled = false;
}

// Split PDF
async function splitPDF() {
    const start = parseInt(startPageInput.value);
    const end = parseInt(endPageInput.value);
    
    if (isNaN(start) || isNaN(end) || start > end) {
        return;
    }
    
    splitBtn.disabled = true;
    progressSection.style.display = 'block';
    showProgress('Duplicating PDF...', 10);
    
    try {
        // Load a fresh copy of the PDF
        const arrayBuffer = await pdfFile.arrayBuffer();
        const newPdf = await PDFLib.PDFDocument.load(arrayBuffer);
        const currentPageCount = newPdf.getPageCount();
        
        showProgress('Removing unwanted pages...', 30);
        
        // Calculate how many pages to remove
        const pagesToRemove = currentPageCount - (end - start + 1);
        let progressPercent = 30;
        const progressIncrement = 60 / pagesToRemove;
        
        // Remove pages AFTER the end page (remove from back to front)
        // This prevents index shifting issues
        for (let i = currentPageCount - 1; i >= end; i--) {
            newPdf.removePage(i);
            progressPercent += progressIncrement / 2;
            if (Math.floor(progressPercent) > Math.floor(progressPercent - progressIncrement / 2)) {
                showProgress(`Removing pages after range... (${Math.floor(progressPercent)}%)`, progressPercent);
            }
        }
        
        // Remove pages BEFORE the start page (remove from back to front)
        for (let i = start - 2; i >= 0; i--) {
            newPdf.removePage(i);
            progressPercent += progressIncrement / 2;
            if (Math.floor(progressPercent) > Math.floor(progressPercent - progressIncrement / 2)) {
                showProgress(`Removing pages before range... (${Math.floor(progressPercent)}%)`, progressPercent);
            }
        }
        
        showProgress('Generating PDF file...', 90);
        
        // Save the modified PDF
        const pdfBytes = await newPdf.save();
        
        showProgress('Preparing download...', 95);
        
        // Create download link
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Generate filename
        const originalName = pdfFile.name.replace('.pdf', '');
        a.download = `${originalName}_pages_${start}-${end}.pdf`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showProgress('Download complete!', 100);
        
        // Hide progress and re-enable button after a short delay
        setTimeout(() => {
            progressSection.style.display = 'none';
            splitBtn.disabled = false;
        }, 1000);
        
    } catch (error) {
        console.error('Error splitting PDF:', error);
        alert('Error creating PDF. Please try again.');
        progressSection.style.display = 'none';
        splitBtn.disabled = false;
    }
}

// Show progress
function showProgress(text, percent) {
    progressSection.style.display = 'block';
    progressText.textContent = text;
    progressFill.style.width = `${percent}%`;
}

// Reset application
function resetApp() {
    pdfFile = null;
    pdfDoc = null;
    totalPages = 0;
    pdfInput.value = '';
    
    uploadBox.style.display = 'block';
    fileInfo.style.display = 'none';
    rangeSection.style.display = 'none';
    actionSection.style.display = 'none';
    progressSection.style.display = 'none';
    
    startPageInput.value = '1';
    endPageInput.value = '1';
}

