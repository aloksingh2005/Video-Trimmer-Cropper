import os
import uuid
import threading
from flask import Flask, render_template, request, jsonify, send_file, abort
from werkzeug.utils import secure_filename
from utils.video_processor import VideoProcessor
import time

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size
app.config['UPLOAD_FOLDER'] = 'static/uploads'

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Allowed video extensions
ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def cleanup_file(file_path, delay=300):
    """Delete file after specified delay (default 5 minutes)"""
    def delete_file():
        time.sleep(delay)
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"Cleaned up: {file_path}")
        except Exception as e:
            print(f"Error cleaning up {file_path}: {e}")
    
    thread = threading.Thread(target=delete_file)
    thread.daemon = True
    thread.start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Unsupported file format. Please use MP4, MOV, AVI, MKV, or WEBM.'}), 400
    
    try:
        # Generate unique filename
        unique_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)
        file_extension = filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{unique_id}.{file_extension}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        
        # Save uploaded file
        file.save(file_path)
        
        # Get video metadata
        processor = VideoProcessor()
        metadata = processor.get_video_metadata(file_path)
        
        if not metadata:
            os.remove(file_path)
            return jsonify({'error': 'Invalid video file or corrupted'}), 400
        
        # Schedule cleanup of original file
        cleanup_file(file_path, 1800)  # 30 minutes
        
        return jsonify({
            'success': True,
            'file_id': unique_id,
            'filename': filename,
            'duration': metadata['duration'],
            'width': metadata['width'],
            'height': metadata['height'],
            'video_url': f"/video/{unique_id}"
        })
        
    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/video/<file_id>')
def serve_video(file_id):
    # Find the file with matching ID
    for filename in os.listdir(app.config['UPLOAD_FOLDER']):
        if filename.startswith(file_id):
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            if os.path.exists(file_path):
                return send_file(file_path)
    abort(404)

@app.route('/process', methods=['POST'])
def process_video():
    try:
        data = request.get_json()
        file_id = data.get('file_id')
        start_time = data.get('start_time', 0)
        end_time = data.get('end_time')
        crop_params = data.get('crop_params')
        quality = data.get('quality', '720p')
        
        if not file_id:
            return jsonify({'error': 'File ID is required'}), 400
        
        # Find original file
        original_file = None
        for filename in os.listdir(app.config['UPLOAD_FOLDER']):
            if filename.startswith(file_id):
                original_file = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                break
        
        if not original_file or not os.path.exists(original_file):
            return jsonify({'error': 'Original file not found'}), 404
        
        # Generate output filename
        output_filename = f"{file_id}_processed.mp4"
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)
        
        # Process video
        processor = VideoProcessor()
        success = processor.process_video(
            input_path=original_file,
            output_path=output_path,
            start_time=start_time,
            end_time=end_time,
            crop_params=crop_params,
            quality=quality
        )
        
        if success:
            # Schedule cleanup of processed file
            cleanup_file(output_path, 600)  # 10 minutes
            
            return jsonify({
                'success': True,
                'download_url': f"/download/{file_id}_processed"
            })
        else:
            return jsonify({'error': 'Video processing failed'}), 500
            
    except Exception as e:
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

@app.route('/download/<filename>')
def download_file(filename):
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{filename}.mp4")
    if os.path.exists(file_path):
        return send_file(file_path, as_attachment=True, download_name=f"trimmed_cropped_video.mp4")
    abort(404)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
