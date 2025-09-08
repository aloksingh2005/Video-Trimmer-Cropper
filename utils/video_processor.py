import subprocess
import json
import os
from typing import Dict, Optional, Tuple

class VideoProcessor:
    def __init__(self):
        self.quality_settings = {
            '480p': {'width': 854, 'height': 480, 'bitrate': '1000k'},
            '720p': {'width': 1280, 'height': 720, 'bitrate': '2500k'},
            '1080p': {'width': 1920, 'height': 1080, 'bitrate': '4000k'}
        }
    
    def get_video_metadata(self, file_path: str) -> Optional[Dict]:
        """Extract video metadata using ffprobe"""
        try:
            cmd = [
                'ffprobe', '-v', 'quiet', '-print_format', 'json',
                '-show_format', '-show_streams', file_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode != 0:
                return None
            
            data = json.loads(result.stdout)
            video_stream = next((s for s in data['streams'] if s['codec_type'] == 'video'), None)
            
            if not video_stream:
                return None
            
            return {
                'duration': float(data['format']['duration']),
                'width': int(video_stream['width']),
                'height': int(video_stream['height']),
                'fps': eval(video_stream.get('r_frame_rate', '30/1')),
                'codec': video_stream['codec_name']
            }
        except Exception as e:
            print(f"Error getting metadata: {e}")
            return None
    
    def process_video(self, input_path: str, output_path: str, start_time: float = 0, 
                     end_time: Optional[float] = None, crop_params: Optional[Dict] = None, 
                     quality: str = '720p') -> bool:
        """Process video with trimming and cropping"""
        try:
            cmd = ['ffmpeg', '-y', '-i', input_path]
            
            # Add start time if specified
            if start_time > 0:
                cmd.extend(['-ss', str(start_time)])
            
            # Add duration if end time specified
            if end_time and end_time > start_time:
                duration = end_time - start_time
                cmd.extend(['-t', str(duration)])
            
            # Build filter complex for cropping and scaling
            filters = []
            
            # Add cropping filter if specified
            if crop_params and crop_params.get('enabled', False):
                x = crop_params.get('x', 0)
                y = crop_params.get('y', 0)
                width = crop_params.get('width', 640)
                height = crop_params.get('height', 480)
                filters.append(f"crop={width}:{height}:{x}:{y}")
            
            # Add scaling filter based on quality
            if quality in self.quality_settings:
                settings = self.quality_settings[quality]
                filters.append(f"scale={settings['width']}:{settings['height']}")
            
            # Apply filters if any
            if filters:
                filter_string = ','.join(filters)
                cmd.extend(['-vf', filter_string])
            
            # Set output quality
            if quality in self.quality_settings:
                cmd.extend(['-b:v', self.quality_settings[quality]['bitrate']])
            
            # Output settings
            cmd.extend([
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '23',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                output_path
            ])
            
            print(f"Running command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode == 0:
                return True
            else:
                print(f"FFmpeg error: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"Error processing video: {e}")
            return False
