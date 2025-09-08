class VideoTrimmerCropper {
    constructor() {
        this.currentVideo = null;
        this.videoDuration = 0;
        this.cropEnabled = false;
        this.cropBox = null;
        this.isDragging = false;
        this.isResizing = false;
        
        this.initializeElements();
        this.setupEventListeners();
    }
    
    initializeElements() {
        // Get DOM elements
        this.uploadArea = document.getElementById('upload-area');
        this.videoInput = document.getElementById('video-input');
        this.browseBtn = document.getElementById('browse-btn');
        this.uploadSection = document.getElementById('upload-section');
        this.editorSection = document.getElementById('editor-section');
        this.progressSection = document.getElementById('progress-section');
        this.downloadSection = document.getElementById('download-section');
        this.videoPreview = document.getElementById('video-preview');
        this.cropOverlay = document.getElementById('crop-overlay');
        this.cropBox = document.getElementById('crop-box');
        this.startTimeInput = document.getElementById('start-time');
        this.endTimeInput = document.getElementById('end-time');
        this.trimSlider = document.getElementById('trim-slider');
        this.enableCropCheckbox = document.getElementById('enable-crop');
        this.cropControls = document.getElementById('crop-controls');
        this.aspectRatioSelect = document.getElementById('aspect-ratio');
        this.qualitySelect = document.getElementById('quality-select');
        this.processBtn = document.getElementById('process-btn');
        this.progressBar = document.getElementById('progress-bar');
        this.progressText = document.getElementById('progress-text');
        this.downloadLink = document.getElementById('download-link');
        this.convertAnotherBtn = document.getElementById('convert-another-btn');
    }
    
    setupEventListeners() {
        // File upload listeners
        this.uploadArea.addEventListener('click', () => this.videoInput.click());
        this.browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.videoInput.click();
        });
        this.videoInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Drag and drop listeners
        this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        
        // Video control listeners
        this.videoPreview.addEventListener('loadedmetadata', () => this.setupVideoControls());
        this.videoPreview.addEventListener('timeupdate', () => this.updateTrimControls());
        
        // Trim control listeners
        this.startTimeInput.addEventListener('input', () => this.updateTrimFromInputs());
        this.endTimeInput.addEventListener('input', () => this.updateTrimFromInputs());
        this.trimSlider.addEventListener('input', () => this.updateTrimFromSlider());
        
        // Crop control listeners
        this.enableCropCheckbox.addEventListener('change', () => this.toggleCrop());
        this.aspectRatioSelect.addEventListener('change', () => this.updateCropAspectRatio());
        
        // Process and download listeners
        this.processBtn.addEventListener('click', () => this.processVideo());
        this.convertAnotherBtn.addEventListener('click', () => this.resetTool());
        
        // Crop box interaction listeners
        this.setupCropBoxListeners();
    }
    
    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('drag-over');
    }
    
    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('drag-over');
    }
    
    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }
    
    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }
    
    async processFile(file) {
        // Validate file type
        const allowedTypes = ['video/mp4', 'video/mov', 'video/avi', 'video/mkv', 'video/webm'];
        if (!allowedTypes.includes(file.type)) {
            this.showError('Please select a valid video file (MP4, MOV, AVI, MKV, or WEBM)');
            return;
        }
        
        // Validate file size (500MB)
        if (file.size > 500 * 1024 * 1024) {
            this.showError('File size must be less than 500MB');
            return;
        }
        
        this.showProgress('Uploading video...', 10);
        
        try {
            const formData = new FormData();
            formData.append('video', file);
            
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.currentVideo = result;
                this.loadVideoEditor(result);
                this.hideProgress();
            } else {
                this.showError(result.error || 'Upload failed');
                this.hideProgress();
            }
        } catch (error) {
            this.showError('Upload failed: ' + error.message);
            this.hideProgress();
        }
    }
    
    loadVideoEditor(videoData) {
        this.uploadSection.classList.add('hidden');
        this.editorSection.classList.remove('hidden');
        
        this.videoPreview.src = videoData.video_url;
        this.videoDuration = videoData.duration;
        
        // Set default end time to full duration
        this.endTimeInput.value = this.formatTime(this.videoDuration);
    }
    
    setupVideoControls() {
        // Setup trim slider
        this.trimSlider.max = this.videoDuration;
        this.trimSlider.value = 0;
        
        // Initialize crop box
        this.resetCropBox();
    }
    
    updateTrimControls() {
        // Update slider position based on video current time
        const currentTime = this.videoPreview.currentTime;
        this.trimSlider.value = currentTime;
    }
    
    updateTrimFromInputs() {
        const startTime = this.parseTime(this.startTimeInput.value);
        const endTime = this.parseTime(this.endTimeInput.value);
        
        if (startTime >= 0 && endTime > startTime) {
            this.videoPreview.currentTime = startTime;
        }
    }
    
    updateTrimFromSlider() {
        const time = parseFloat(this.trimSlider.value);
        this.videoPreview.currentTime = time;
        this.startTimeInput.value = this.formatTime(time);
    }
    
    toggleCrop() {
        this.cropEnabled = this.enableCropCheckbox.checked;
        
        if (this.cropEnabled) {
            this.cropControls.classList.remove('hidden');
            this.cropOverlay.classList.remove('hidden');
            this.cropOverlay.classList.add('active');
            this.resetCropBox();
        } else {
            this.cropControls.classList.add('hidden');
            this.cropOverlay.classList.add('hidden');
            this.cropOverlay.classList.remove('active');
        }
    }
    
    resetCropBox() {
        const videoRect = this.videoPreview.getBoundingClientRect();
        const containerRect = this.videoPreview.parentElement.getBoundingClientRect();
        
        // Calculate video display dimensions
        const videoAspectRatio = this.videoPreview.videoWidth / this.videoPreview.videoHeight;
        const containerAspectRatio = containerRect.width / containerRect.height;
        
        let displayWidth, displayHeight, offsetX, offsetY;
        
        if (videoAspectRatio > containerAspectRatio) {
            displayWidth = containerRect.width;
            displayHeight = containerRect.width / videoAspectRatio;
            offsetX = 0;
            offsetY = (containerRect.height - displayHeight) / 2;
        } else {
            displayWidth = containerRect.height * videoAspectRatio;
            displayHeight = containerRect.height;
            offsetX = (containerRect.width - displayWidth) / 2;
            offsetY = 0;
        }
        
        // Set initial crop box to center 50% of video
        const cropWidth = displayWidth * 0.5;
        const cropHeight = displayHeight * 0.5;
        const cropX = offsetX + (displayWidth - cropWidth) / 2;
        const cropY = offsetY + (displayHeight - cropHeight) / 2;
        
        this.cropBox.style.left = cropX + 'px';
        this.cropBox.style.top = cropY + 'px';
        this.cropBox.style.width = cropWidth + 'px';
        this.cropBox.style.height = cropHeight + 'px';
    }
    
    updateCropAspectRatio() {
        const aspectRatio = this.aspectRatioSelect.value;
        if (aspectRatio === 'free') return;
        
        const [widthRatio, heightRatio] = aspectRatio.split(':').map(Number);
        const currentWidth = parseFloat(this.cropBox.style.width);
        const newHeight = currentWidth * (heightRatio / widthRatio);
        
        this.cropBox.style.height = newHeight + 'px';
    }
    
    setupCropBoxListeners() {
        let startX, startY, startWidth, startHeight, startLeft, startTop;
        
        // Drag to move
        this.cropBox.addEventListener('mousedown', (e) => {
            if (e.target === this.cropBox) {
                this.isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startLeft = parseFloat(this.cropBox.style.left);
                startTop = parseFloat(this.cropBox.style.top);
                e.preventDefault();
            }
        });
        
        // Resize handles
        const resizeHandles = this.cropBox.querySelectorAll('div');
        resizeHandles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                this.isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = parseFloat(this.cropBox.style.width);
                startHeight = parseFloat(this.cropBox.style.height);
                startLeft = parseFloat(this.cropBox.style.left);
                startTop = parseFloat(this.cropBox.style.top);
                e.stopPropagation();
                e.preventDefault();
            });
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                this.cropBox.style.left = (startLeft + dx) + 'px';
                this.cropBox.style.top = (startTop + dy) + 'px';
            } else if (this.isResizing) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                // Simple resize from bottom-right corner
                this.cropBox.style.width = Math.max(50, startWidth + dx) + 'px';
                this.cropBox.style.height = Math.max(50, startHeight + dy) + 'px';
            }
        });
        
        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.isResizing = false;
        });
    }
    
    async processVideo() {
        if (!this.currentVideo) return;
        
        this.processBtn.disabled = true;
        this.showProgress('Processing video...', 20);
        
        try {
            const startTime = this.parseTime(this.startTimeInput.value);
            const endTime = this.parseTime(this.endTimeInput.value);
            const quality = this.qualitySelect.value;
            
            let cropParams = null;
            if (this.cropEnabled) {
                const videoRect = this.videoPreview.getBoundingClientRect();
                const cropRect = this.cropBox.getBoundingClientRect();
                
                // Calculate crop parameters relative to actual video dimensions
                const scaleX = this.videoPreview.videoWidth / videoRect.width;
                const scaleY = this.videoPreview.videoHeight / videoRect.height;
                
                cropParams = {
                    enabled: true,
                    x: Math.round((cropRect.left - videoRect.left) * scaleX),
                    y: Math.round((cropRect.top - videoRect.top) * scaleY),
                    width: Math.round(cropRect.width * scaleX),
                    height: Math.round(cropRect.height * scaleY)
                };
            }
            
            const requestData = {
                file_id: this.currentVideo.file_id,
                start_time: startTime,
                end_time: endTime > startTime ? endTime : null,
                crop_params: cropParams,
                quality: quality
            };
            
            // Simulate progress updates
            this.simulateProgress();
            
            const response = await fetch('/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showDownload(result.download_url);
            } else {
                this.showError(result.error || 'Processing failed');
            }
        } catch (error) {
            this.showError('Processing failed: ' + error.message);
        } finally {
            this.processBtn.disabled = false;
            this.hideProgress();
        }
    }
    
    simulateProgress() {
        let progress = 20;
        const interval = setInterval(() => {
            progress += Math.random() * 20;
            if (progress > 90) progress = 90;
            this.updateProgress(progress, 'Processing video...');
        }, 1000);
        
        // Clear interval after 10 seconds
        setTimeout(() => clearInterval(interval), 10000);
    }
    
    showDownload(downloadUrl) {
        this.editorSection.classList.add('hidden');
        this.downloadSection.classList.remove('hidden');
        this.downloadLink.href = downloadUrl;
    }
    
    resetTool() {
        this.currentVideo = null;
        this.videoDuration = 0;
        this.cropEnabled = false;
        
        // Reset UI
        this.downloadSection.classList.add('hidden');
        this.editorSection.classList.add('hidden');
        this.uploadSection.classList.remove('hidden');
        
        // Reset form
        this.videoInput.value = '';
        this.startTimeInput.value = '';
        this.endTimeInput.value = '';
        this.enableCropCheckbox.checked = false;
        this.cropControls.classList.add('hidden');
        this.cropOverlay.classList.add('hidden');
        this.qualitySelect.value = '720p';
        
        // Clear video
        this.videoPreview.src = '';
    }
    
    showProgress(message, progress) {
        this.progressSection.classList.remove('hidden');
        this.updateProgress(progress, message);
    }
    
    updateProgress(progress, message) {
        this.progressBar.style.width = progress + '%';
        this.progressText.textContent = message;
    }
    
    hideProgress() {
        this.progressSection.classList.add('hidden');
    }
    
    showError(message) {
        alert('Error: ' + message);
    }
    
    parseTime(timeString) {
        if (!timeString) return 0;
        
        const parts = timeString.split(':');
        if (parts.length === 3) {
            const hours = parseInt(parts[0]) || 0;
            const minutes = parseInt(parts[1]) || 0;
            const seconds = parseInt(parts[2]) || 0;
            return hours * 3600 + minutes * 60 + seconds;
        } else if (parts.length === 2) {
            const minutes = parseInt(parts[0]) || 0;
            const seconds = parseInt(parts[1]) || 0;
            return minutes * 60 + seconds;
        } else {
            return parseInt(timeString) || 0;
        }
    }
    
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new VideoTrimmerCropper();
});
