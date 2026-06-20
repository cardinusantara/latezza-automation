const { execFile } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

console.log('FFmpeg binary path:', ffmpegPath);

execFile(ffmpegPath, ['-version'], (error, stdout, stderr) => {
  if (error) {
    console.error('Error executing FFmpeg:', error);
  } else {
    console.log('FFmpeg runs successfully! Output:\n', stdout.split('\n')[0]);
  }
});
