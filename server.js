const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3050;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Downloads directory
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Locate FFmpeg
function detectFFmpeg() {
  const possiblePaths = [
    'ffmpeg',
    'C:\\Users\\phong\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-9.0.2-full_build', 'bin', 'ffmpeg.exe'),
    path.join(__dirname, 'ffmpeg.exe'),
    path.join(__dirname, 'bin', 'ffmpeg.exe')
  ];

  for (const p of possiblePaths) {
    try {
      if (p.includes('\\') || p.includes('/')) {
        if (fs.existsSync(p)) {
          execSync(`"${p}" -version`, { stdio: 'ignore' });
          return p;
        }
      } else {
        execSync(`${p} -version`, { stdio: 'ignore' });
        return p;
      }
    } catch (e) {
      // continue checking
    }
  }
  return null;
}

const FFMPEG_PATH = detectFFmpeg();
console.log('Detected FFmpeg path:', FFMPEG_PATH || 'Not found');

// In-memory active jobs and SSE clients
const activeJobs = new Map();
const sseClients = new Map();

function broadcastJob(jobId, data) {
  const clients = sseClients.get(jobId);
  if (clients) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch (err) {
        // client closed
      }
    }
  }
}

function addJobLog(job, message, level = 'info') {
  const entry = {
    time: new Date().toLocaleTimeString(),
    message,
    level
  };
  job.logs.push(entry);
  if (job.logs.length > 300) job.logs.shift();
  broadcastJob(job.id, { type: 'log', log: entry });
}

// Pexels API helper
async function callPexels(endpoint, apiKey, params = {}) {
  const url = new URL(endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.append(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': apiKey,
      'User-Agent': 'PexelsVideoDownloader/1.0'
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `Pexels API error: ${res.status} ${res.statusText}`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error) msg += ` - ${errJson.error}`;
    } catch (_) {
      if (errText) msg += ` - ${errText.slice(0, 100)}`;
    }
    throw new Error(msg);
  }

  return await res.json();
}

// Fisher-Yates Shuffle
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pick optimal video file url
function getBestVideoFile(videoFiles, preferredQuality = 'hd') {
  if (!videoFiles || videoFiles.length === 0) return null;
  
  // Filter for mp4
  const mp4s = videoFiles.filter(f => f.file_type === 'video/mp4' || !f.file_type || f.link.includes('.mp4'));
  const pool = mp4s.length > 0 ? mp4s : videoFiles;

  if (preferredQuality === '4k' || preferredQuality === 'large') {
    // Highest resolution
    return pool.reduce((prev, curr) => ((curr.width * curr.height) > (prev.width * prev.height)) ? curr : prev, pool[0]);
  } else if (preferredQuality === 'sd' || preferredQuality === 'small') {
    // SD or lowest
    const sds = pool.filter(f => f.quality === 'sd' || (f.height <= 720 && f.height >= 480));
    if (sds.length > 0) return sds[0];
    return pool.reduce((prev, curr) => ((curr.width * curr.height) < (prev.width * prev.height)) ? curr : prev, pool[0]);
  } else {
    // Default HD (1080p or closest)
    const hds = pool.filter(f => f.quality === 'hd' || f.height === 1080);
    if (hds.length > 0) {
      // Find one around 1080p
      const exact1080 = hds.find(f => f.height === 1080);
      if (exact1080) return exact1080;
      return hds[0];
    }
    return pool[0];
  }
}

// --- API ROUTES ---

// System Status
app.get('/api/status', (req, res) => {
  res.json({
    online: true,
    ffmpegInstalled: !!FFMPEG_PATH,
    ffmpegPath: FFMPEG_PATH,
    downloadsDir: DOWNLOADS_DIR,
    nodeVersion: process.version
  });
});

// Verify API Key
app.post('/api/verify-key', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    return res.status(400).json({ valid: false, error: 'API key is required' });
  }

  try {
    const data = await callPexels('https://api.pexels.com/v1/videos/popular', apiKey.trim(), { per_page: 1 });
    res.json({ valid: true, sampleVideoCount: data.total_results || 1 });
  } catch (err) {
    res.status(401).json({ valid: false, error: err.message });
  }
});

// Search Videos
app.get('/api/search', async (req, res) => {
  const apiKey = req.headers['authorization'] || req.query.apiKey;
  if (!apiKey) {
    return res.status(401).json({ error: 'Authorization header with Pexels API key required' });
  }

  const { query, orientation, size, locale, page = 1, per_page = 20 } = req.query;

  try {
    let data;
    if (!query || query.trim() === '' || query.toLowerCase() === 'popular' || query.toLowerCase() === 'trending') {
      data = await callPexels('https://api.pexels.com/v1/videos/popular', apiKey, {
        page,
        per_page
      });
    } else {
      data = await callPexels('https://api.pexels.com/v1/videos/search', apiKey, {
        query: query.trim(),
        orientation: orientation !== 'all' ? orientation : undefined,
        size: size !== 'all' ? size : undefined,
        locale: locale || undefined,
        page,
        per_page
      });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Automatically collect videos for Target Duration across multiple pages & shuffle
app.post('/api/fetch-duration-batch', async (req, res) => {
  const apiKey = req.headers['authorization'] || req.body.apiKey;
  if (!apiKey) {
    return res.status(401).json({ error: 'Authorization header with Pexels API key required' });
  }

  const {
    query = 'nature',
    targetDurationSeconds = 7200, // default 2 hours = 7200s
    orientation = 'all',
    size = 'all',
    shuffle = true,
    maxPages = 10,
    preferredQuality = 'hd'
  } = req.body;

  try {
    let accumulatedDuration = 0;
    const collectedVideos = [];
    const seenIds = new Set();
    const isPopular = !query || query.trim() === '' || query.toLowerCase() === 'popular' || query.toLowerCase() === 'trending';
    const endpoint = isPopular ? 'https://api.pexels.com/v1/videos/popular' : 'https://api.pexels.com/v1/videos/search';

    // We fetch pages (up to 80 per page for maximum efficiency)
    let currentPage = 1;
    let totalResults = Infinity;

    while (currentPage <= maxPages && accumulatedDuration < targetDurationSeconds) {
      const params = {
        page: currentPage,
        per_page: 80
      };
      if (!isPopular) {
        params.query = query.trim();
        if (orientation && orientation !== 'all') params.orientation = orientation;
        if (size && size !== 'all') params.size = size;
      }

      const data = await callPexels(endpoint, apiKey, params);
      const videos = data.videos || [];
      if (videos.length === 0) break;

      totalResults = data.total_results || videos.length;

      for (const v of videos) {
        if (!seenIds.has(v.id)) {
          seenIds.add(v.id);
          const bestFile = getBestVideoFile(v.video_files, preferredQuality);
          collectedVideos.push({
            id: v.id,
            duration: v.duration || 15,
            width: v.width,
            height: v.height,
            image: v.image,
            url: v.url,
            user: v.user,
            video_file: bestFile,
            all_files: v.video_files
          });
          accumulatedDuration += (v.duration || 15);
          if (accumulatedDuration >= targetDurationSeconds * 1.2) {
            // Buffer 20% extra to allow high-variance shuffle selection
            break;
          }
        }
      }

      if (videos.length < 80 || currentPage * 80 >= totalResults) {
        break; // no more pages
      }
      currentPage++;
    }

    if (collectedVideos.length === 0) {
      return res.status(404).json({ error: 'No videos found for this category or filter' });
    }

    // Now shuffle if requested
    let finalSelectionPool = collectedVideos;
    if (shuffle) {
      finalSelectionPool = shuffleArray(collectedVideos);
    }

    // Pick items until target duration is reached
    let selectedDuration = 0;
    const finalSelected = [];

    for (const v of finalSelectionPool) {
      finalSelected.push(v);
      selectedDuration += v.duration;
      if (selectedDuration >= targetDurationSeconds) {
        break;
      }
    }

    res.json({
      query,
      targetDurationSeconds,
      selectedDuration,
      totalCount: finalSelected.length,
      videos: finalSelected,
      poolSizeAvailable: collectedVideos.length,
      pagesFetched: currentPage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Batch Download & Optional Merge Job
app.post('/api/download/start', async (req, res) => {
  const {
    videos = [],
    jobName = 'pexels_batch',
    concurrency = 5,
    preferredQuality = 'hd',
    merge = false,
    targetDurationSeconds = 0,
    trimExact = false,
    shuffle = false
  } = req.body;

  if (!videos || videos.length === 0) {
    return res.status(400).json({ error: 'No videos provided to download' });
  }

  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const cleanCategoryName = (jobName || 'video_batch').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30);
  const jobDir = path.join(DOWNLOADS_DIR, `${cleanCategoryName}_${Date.now()}`);
  fs.mkdirSync(jobDir, { recursive: true });

  let jobVideos = [...videos];
  if (shuffle) {
    jobVideos = shuffleArray(jobVideos);
  }

  // Calculate total planned duration
  const totalPlannedDuration = jobVideos.reduce((acc, v) => acc + (v.duration || 0), 0);

  const job = {
    id: jobId,
    name: jobName,
    dir: jobDir,
    totalVideos: jobVideos.length,
    completedVideos: 0,
    failedVideos: 0,
    totalPlannedDuration,
    targetDurationSeconds: targetDurationSeconds || totalPlannedDuration,
    status: 'downloading', // 'downloading', 'merging', 'completed', 'cancelled', 'error'
    progressPercent: 0,
    currentSpeedBps: 0,
    totalBytesDownloaded: 0,
    totalEstimatedBytes: 0,
    videos: jobVideos.map((v, idx) => ({
      index: idx + 1,
      id: v.id,
      duration: v.duration,
      url: v.video_file ? v.video_file.link : (v.video_files ? getBestVideoFile(v.video_files, preferredQuality)?.link : null),
      quality: v.video_file ? `${v.video_file.width}x${v.video_file.height}` : preferredQuality,
      status: 'pending', // 'pending', 'downloading', 'completed', 'failed'
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      filename: `video_${String(idx + 1).padStart(3, '0')}_${v.id}.mp4`,
      filepath: path.join(jobDir, `video_${String(idx + 1).padStart(3, '0')}_${v.id}.mp4`),
      error: null
    })),
    merge,
    trimExact,
    mergedFile: null,
    mergeProgress: 0,
    logs: [],
    startTime: Date.now(),
    endTime: null,
    cancelled: false
  };

  activeJobs.set(jobId, job);

  addJobLog(job, `Khởi tạo tiến trình tải [${job.id}] - Tổng số: ${job.totalVideos} videos (${Math.round(totalPlannedDuration / 60)} phút)`);
  addJobLog(job, `Thư mục lưu trữ: ${jobDir}`);
  if (merge) {
    addJobLog(job, `Chế độ tự động gộp (Merge) được bật: Sẽ tạo 1 video hoàn chỉnh sau khi tải xong.`);
  }

  // Start background process
  runDownloadJob(job, Math.max(1, Math.min(concurrency || 5, 15)));

  res.json({
    jobId,
    status: 'started',
    totalVideos: job.totalVideos,
    dir: jobDir
  });
});

// SSE progress stream
app.get('/api/download/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);
  if (!job) {
    return res.status(404).send('Job not found');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sseClients.has(jobId)) {
    sseClients.set(jobId, new Set());
  }
  sseClients.get(jobId).add(res);

  // Send initial snapshot
  res.write(`data: ${JSON.stringify({ type: 'snapshot', job: sanitizeJobForClient(job) })}\n\n`);

  req.on('close', () => {
    const clients = sseClients.get(jobId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) sseClients.delete(jobId);
    }
  });
});

// Cancel Job
app.post('/api/download/cancel/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  job.cancelled = true;
  job.status = 'cancelled';
  addJobLog(job, 'Người dùng đã hủy tiến trình tải.', 'warn');
  broadcastJob(job.id, { type: 'cancelled', job: sanitizeJobForClient(job) });

  res.json({ success: true, message: 'Job cancelled' });
});

// Open download directory in Windows Explorer
app.post('/api/open-folder', (req, res) => {
  const { folderPath } = req.body;
  const target = folderPath && fs.existsSync(folderPath) ? folderPath : DOWNLOADS_DIR;

  try {
    spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
    res.json({ success: true, path: target });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download single file or merged video directly
app.get('/api/download/file/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;
  const job = activeJobs.get(jobId);
  if (!job) {
    return res.status(404).send('Job not found');
  }

  const filePath = path.join(job.dir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  res.download(filePath, filename);
});

// List past jobs / batches
app.get('/api/history', (req, res) => {
  try {
    const folders = fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const fullPath = path.join(DOWNLOADS_DIR, dirent.name);
        const files = fs.readdirSync(fullPath);
        const mp4Files = files.filter(f => f.endsWith('.mp4'));
        const mergedFile = files.find(f => f.startsWith('MERGED_') || f.includes('merged'));
        const stat = fs.statSync(fullPath);
        return {
          folderName: dirent.name,
          folderPath: fullPath,
          videoCount: mp4Files.length,
          mergedFile: mergedFile || null,
          createdAt: stat.birthtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to sanitize job object for network transmission
function sanitizeJobForClient(job) {
  return {
    id: job.id,
    name: job.name,
    dir: job.dir,
    totalVideos: job.totalVideos,
    completedVideos: job.completedVideos,
    failedVideos: job.failedVideos,
    totalPlannedDuration: job.totalPlannedDuration,
    targetDurationSeconds: job.targetDurationSeconds,
    status: job.status,
    progressPercent: job.progressPercent,
    currentSpeedBps: job.currentSpeedBps,
    totalBytesDownloaded: job.totalBytesDownloaded,
    merge: job.merge,
    mergedFile: job.mergedFile,
    mergeProgress: job.mergeProgress,
    logs: job.logs,
    startTime: job.startTime,
    endTime: job.endTime,
    videos: job.videos.map(v => ({
      index: v.index,
      id: v.id,
      duration: v.duration,
      quality: v.quality,
      status: v.status,
      progress: v.progress,
      downloadedBytes: v.downloadedBytes,
      totalBytes: v.totalBytes,
      filename: v.filename,
      error: v.error
    }))
  };
}

// Single Video Fast Downloader with Stream & Progress Tracking
async function downloadSingleVideo(videoItem, job) {
  if (job.cancelled) return;

  videoItem.status = 'downloading';
  videoItem.progress = 0;
  broadcastJob(job.id, { type: 'video_update', video: videoItem });

  if (!videoItem.url) {
    videoItem.status = 'failed';
    videoItem.error = 'No valid video download URL found';
    job.failedVideos++;
    addJobLog(job, `[#${videoItem.index}] Thất bại: Không có link tải hợp lệ`, 'error');
    broadcastJob(job.id, { type: 'video_update', video: videoItem });
    return;
  }

  const destPath = videoItem.filepath;
  let lastBytes = 0;
  let lastSpeedCheck = Date.now();

  try {
    const res = await fetch(videoItem.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    videoItem.totalBytes = contentLength;

    const fileStream = fs.createWriteStream(destPath);
    let downloaded = 0;

    const reader = res.body.getReader();

    while (true) {
      if (job.cancelled) {
        reader.cancel();
        fileStream.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      fileStream.write(Buffer.from(value));
      downloaded += value.length;
      job.totalBytesDownloaded += value.length;
      videoItem.downloadedBytes = downloaded;

      if (contentLength > 0) {
        videoItem.progress = Math.min(100, Math.round((downloaded / contentLength) * 100));
      }

      // Calculate speed every 500ms
      const now = Date.now();
      if (now - lastSpeedCheck >= 500) {
        const deltaBytes = downloaded - lastBytes;
        const deltaSec = (now - lastSpeedCheck) / 1000;
        job.currentSpeedBps = Math.round(deltaBytes / deltaSec);
        lastBytes = downloaded;
        lastSpeedCheck = now;

        updateOverallJobProgress(job);
        broadcastJob(job.id, {
          type: 'progress_tick',
          video: { index: videoItem.index, progress: videoItem.progress, downloadedBytes: videoItem.downloadedBytes },
          overall: {
            progressPercent: job.progressPercent,
            speedBps: job.currentSpeedBps,
            totalDownloaded: job.totalBytesDownloaded,
            completed: job.completedVideos
          }
        });
      }
    }

    await new Promise(resolve => fileStream.end(resolve));

    videoItem.status = 'completed';
    videoItem.progress = 100;
    job.completedVideos++;
    updateOverallJobProgress(job);

    addJobLog(job, `[#${videoItem.index}] Tải thành công (${Math.round(downloaded / (1024 * 1024) * 10) / 10}MB): ${videoItem.filename}`, 'success');
    broadcastJob(job.id, { type: 'video_update', video: videoItem });
  } catch (err) {
    videoItem.status = 'failed';
    videoItem.error = err.message;
    job.failedVideos++;
    updateOverallJobProgress(job);
    addJobLog(job, `[#${videoItem.index}] Lỗi tải: ${err.message}`, 'error');
    broadcastJob(job.id, { type: 'video_update', video: videoItem });
  }
}

function updateOverallJobProgress(job) {
  if (job.totalVideos === 0) {
    job.progressPercent = 100;
    return;
  }
  const finishedCount = job.completedVideos + job.failedVideos;
  const inProgressSum = job.videos.reduce((sum, v) => sum + (v.status === 'downloading' ? v.progress : 0), 0);
  const percent = ((finishedCount * 100) + inProgressSum) / job.totalVideos;
  job.progressPercent = Math.min(100, Math.round(percent * 10) / 10);
}

// Job Runner with Concurrency
async function runDownloadJob(job, concurrency = 5) {
  const queue = [...job.videos];
  const activeWorkers = new Set();

  addJobLog(job, `Bắt đầu tải đồng thời (Tối đa ${concurrency} luồng cùng lúc)...`);

  async function next() {
    if (job.cancelled) return;
    if (queue.length === 0) return;

    const item = queue.shift();
    const promise = downloadSingleVideo(item, job)
      .finally(() => {
        activeWorkers.delete(promise);
      });

    activeWorkers.add(promise);

    if (queue.length > 0 && activeWorkers.size < concurrency && !job.cancelled) {
      next();
    }

    await promise;
    if (queue.length > 0 && !job.cancelled) {
      next();
    }
  }

  // Spin up initial pool
  const initialPoolSize = Math.min(concurrency, queue.length);
  const initialPromises = [];
  for (let i = 0; i < initialPoolSize; i++) {
    initialPromises.push(next());
  }

  // Wait until all downloads complete or cancelled
  while ((queue.length > 0 || activeWorkers.size > 0) && !job.cancelled) {
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  if (job.cancelled) {
    job.status = 'cancelled';
    job.endTime = Date.now();
    broadcastJob(job.id, { type: 'completed', job: sanitizeJobForClient(job) });
    return;
  }

  addJobLog(job, `Đã hoàn tất quá trình tải: ${job.completedVideos}/${job.totalVideos} videos tải thành công.`);

  // If user requested Video Merge and FFmpeg is available
  if (job.merge && job.completedVideos > 0) {
    if (!FFMPEG_PATH) {
      addJobLog(job, `Không tìm thấy FFmpeg trên hệ thống. Bỏ qua bước gộp video. Các video riêng lẻ vẫn được lưu trong thư mục.`, 'warn');
      job.status = 'completed';
      job.endTime = Date.now();
      broadcastJob(job.id, { type: 'completed', job: sanitizeJobForClient(job) });
      return;
    }

    await mergeVideos(job);
  } else {
    job.status = 'completed';
    job.endTime = Date.now();
    broadcastJob(job.id, { type: 'completed', job: sanitizeJobForClient(job) });
  }
}

// FFmpeg Video Merger
async function mergeVideos(job) {
  job.status = 'merging';
  job.mergeProgress = 0;
  addJobLog(job, `--- BẮT ĐẦU QUÁ TRÌNH GỘP VIDEO (FFMPEG) ---`);
  broadcastJob(job.id, { type: 'merge_status', job: sanitizeJobForClient(job) });

  const successfulVideos = job.videos.filter(v => v.status === 'completed' && fs.existsSync(v.filepath));
  if (successfulVideos.length === 0) {
    addJobLog(job, `Không có video nào hợp lệ để gộp.`, 'error');
    job.status = 'completed';
    job.endTime = Date.now();
    broadcastJob(job.id, { type: 'completed', job: sanitizeJobForClient(job) });
    return;
  }

  const mergedFilename = `MERGED_${job.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}_${Date.now()}.mp4`;
  const mergedOutputPath = path.join(job.dir, mergedFilename);

  // Strategy:
  // To guarantee 100% successful concat without visual glitch or codec mismatches (Pexels videos have varying frame rates, resolutions, aspect ratios),
  // we first transcode/normalize clips into standardized fast intermediate clips, or use concat filter with scale.
  // When number of clips is large (> 10), we standardize clips into uniform temp files: 1920x1080 @ 30fps H264 ultrafast, then concat demuxer!
  const intermediateDir = path.join(job.dir, 'temp_normalized');
  fs.mkdirSync(intermediateDir, { recursive: true });

  const intermediateFiles = [];
  addJobLog(job, `Chuẩn hóa ${successfulVideos.length} clips về chuẩn 1080p 30fps để ghép nối mượt mà...`);

  for (let i = 0; i < successfulVideos.length; i++) {
    if (job.cancelled) break;
    const v = successfulVideos[i];
    const tempFile = path.join(intermediateDir, `norm_${String(i).padStart(3, '0')}.ts`);
    intermediateFiles.push(tempFile);

    // Progress
    const normPercent = Math.round(((i) / successfulVideos.length) * 60);
    job.mergeProgress = normPercent;
    broadcastJob(job.id, { type: 'merge_progress', percent: normPercent, currentStep: `Chuẩn hóa clip ${i + 1}/${successfulVideos.length}` });

    addJobLog(job, `[FFmpeg] Chuẩn hóa clip ${i + 1}/${successfulVideos.length}: ${v.filename}...`);

    await new Promise((resolve) => {
      // Standardize resolution with aspect ratio preserved + letterbox padding to 1920x1080
      const vf = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30';
      const ffmpegArgs = [
        '-y',
        '-i', v.filepath,
        '-vf', vf,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-an',
        '-f', 'mpegts',
        tempFile
      ];

      const proc = spawn(FFMPEG_PATH, ffmpegArgs, { windowsHide: true });
      proc.on('close', (code) => {
        resolve();
      });
      proc.on('error', (err) => {
        addJobLog(job, `[FFmpeg Error clip ${i + 1}] ${err.message}`, 'error');
        resolve();
      });
    });
  }

  if (job.cancelled) {
    try { fs.rmSync(intermediateDir, { recursive: true, force: true }); } catch (_) {}
    return;
  }

  // Create concat file list
  const listFile = path.join(job.dir, 'concat_list.txt');
  const validIntermediate = intermediateFiles.filter(f => fs.existsSync(f));

  if (validIntermediate.length === 0) {
    addJobLog(job, `Không thể chuẩn hóa video nào để gộp.`, 'error');
    job.status = 'error';
    job.endTime = Date.now();
    broadcastJob(job.id, { type: 'completed', job: sanitizeJobForClient(job) });
    return;
  }

  const listContent = validIntermediate.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(listFile, listContent, 'utf8');

  addJobLog(job, `Ghép nối siêu tốc tất cả ${validIntermediate.length} clips thành video hoàn chỉnh...`);
  job.mergeProgress = 70;
  broadcastJob(job.id, { type: 'merge_progress', percent: 70, currentStep: 'Đang ghép nối file...' });

  const tempMerged = path.join(job.dir, 'temp_raw_merged.mp4');

  await new Promise((resolve) => {
    const concatArgs = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      tempMerged
    ];

    const proc = spawn(FFMPEG_PATH, concatArgs, { windowsHide: true });
    proc.on('close', () => resolve());
    proc.on('error', (err) => {
      addJobLog(job, `Lỗi ghép: ${err.message}`, 'error');
      resolve();
    });
  });

  // Check if we need to trim to exact target duration
  if (job.trimExact && job.targetDurationSeconds > 0 && fs.existsSync(tempMerged)) {
    addJobLog(job, `Cắt chính xác theo thời lượng mục tiêu: ${job.targetDurationSeconds} giây (${Math.round(job.targetDurationSeconds / 60)} phút)...`);
    job.mergeProgress = 90;
    broadcastJob(job.id, { type: 'merge_progress', percent: 90, currentStep: 'Cắt chuẩn thời gian...' });

    await new Promise((resolve) => {
      const trimArgs = [
        '-y',
        '-i', tempMerged,
        '-t', String(job.targetDurationSeconds),
        '-c', 'copy',
        mergedOutputPath
      ];
      const proc = spawn(FFMPEG_PATH, trimArgs, { windowsHide: true });
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });

    try { fs.unlinkSync(tempMerged); } catch (_) {}
  } else if (fs.existsSync(tempMerged)) {
    // Rename tempMerged to mergedOutputPath
    if (fs.existsSync(mergedOutputPath)) fs.unlinkSync(mergedOutputPath);
    fs.renameSync(tempMerged, mergedOutputPath);
  }

  // Cleanup temp intermediate directory and list file
  try {
    fs.rmSync(intermediateDir, { recursive: true, force: true });
    if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
  } catch (_) {}

  if (fs.existsSync(mergedOutputPath)) {
    const stats = fs.statSync(mergedOutputPath);
    const sizeMb = Math.round(stats.size / (1024 * 1024) * 10) / 10;
    job.mergedFile = {
      filename: mergedFilename,
      filepath: mergedOutputPath,
      sizeBytes: stats.size,
      sizeMb: sizeMb
    };
    job.mergeProgress = 100;
    addJobLog(job, `🎉 GỘP VIDEO THÀNH CÔNG! File: ${mergedFilename} (${sizeMb} MB)`, 'success');
  } else {
    addJobLog(job, `Gộp video thất bại hoặc file không được tạo.`, 'error');
  }

  job.status = 'completed';
  job.endTime = Date.now();
  broadcastJob(job.id, { type: 'completed', job: sanitizeJobForClient(job) });
}

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Pexels Video Downloader Web Tool`);
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log(`📁 Downloads folder:  ${DOWNLOADS_DIR}`);
  console.log(`🎬 FFmpeg path:      ${FFMPEG_PATH || 'NOT FOUND (Video merge disabled)'}`);
  console.log(`=======================================================`);
});
