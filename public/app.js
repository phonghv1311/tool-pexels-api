// Pexels Video Studio Client Application
let apiKey = localStorage.getItem('pexels_api_key') || '';
let currentVideos = []; // All videos loaded in current view
let selectedVideoIds = new Set();
let activeJobId = null;
let sseSource = null;
let currentSearchMode = 'duration'; // 'duration' or 'standard'
let standardPage = 1;

// Elements
const apiKeyInput = document.getElementById('apiKeyInput');
const verifyApiKeyBtn = document.getElementById('verifyApiKeyBtn');
const apiKeyBanner = document.getElementById('apiKeyBanner');
const ffmpegBadge = document.getElementById('ffmpegBadge');
const openFolderBtn = document.getElementById('openFolderBtn');

const tabSearch = document.getElementById('tabSearch');
const tabDownloads = document.getElementById('tabDownloads');
const searchView = document.getElementById('searchView');
const downloadsView = document.getElementById('downloadsView');
const activeJobIndicator = document.getElementById('activeJobIndicator');

const categoryChips = document.getElementById('categoryChips');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const orientationSelect = document.getElementById('orientationSelect');
const qualitySelect = document.getElementById('qualitySelect');

const durHours = document.getElementById('durHours');
const durMins = document.getElementById('durMins');
const durSecs = document.getElementById('durSecs');
const targetSummaryText = document.getElementById('targetSummaryText');
const shuffleCheck = document.getElementById('shuffleCheck');
const mergeCheck = document.getElementById('mergeCheck');
const trimExactCheck = document.getElementById('trimExactCheck');
const concurrencyRange = document.getElementById('concurrencyRange');
const concurrencyValue = document.getElementById('concurrencyValue');

const btnFetchDuration = document.getElementById('btnFetchDuration');
const btnSearchStandard = document.getElementById('btnSearchStandard');
const selectionSummaryBar = document.getElementById('selectionSummaryBar');
const selectedCountBadge = document.getElementById('selectedCountBadge');
const selectedCountText = document.getElementById('selectedCountText');
const totalSelectedDurationText = document.getElementById('totalSelectedDurationText');
const barTargetDurText = document.getElementById('barTargetDurText');
const durationMatchBadge = document.getElementById('durationMatchBadge');
const btnReshuffle = document.getElementById('btnReshuffle');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnDeselectAll = document.getElementById('btnDeselectAll');
const btnStartBatchDownload = document.getElementById('btnStartBatchDownload');

const searchLoading = document.getElementById('searchLoading');
const loadingTitle = document.getElementById('loadingTitle');
const loadingDesc = document.getElementById('loadingDesc');
const emptyResults = document.getElementById('emptyResults');
const videoCardsGrid = document.getElementById('videoCardsGrid');
const standardPagination = document.getElementById('standardPagination');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicatorText = document.getElementById('pageIndicatorText');

// Downloads elements
const activeJobSection = document.getElementById('activeJobSection');
const activeJobTitle = document.getElementById('activeJobTitle');
const activeJobPath = document.getElementById('activeJobPath');
const activeJobStatusBadge = document.getElementById('activeJobStatusBadge');
const btnCancelJob = document.getElementById('btnCancelJob');
const btnOpenJobFolder = document.getElementById('btnOpenJobFolder');
const statProgressPercent = document.getElementById('statProgressPercent');
const statCompletedCount = document.getElementById('statCompletedCount');
const statSpeed = document.getElementById('statSpeed');
const statDownloadedBytes = document.getElementById('statDownloadedBytes');
const statDuration = document.getElementById('statDuration');
const overallProgressBar = document.getElementById('overallProgressBar');
const progressBarLabel = document.getElementById('progressBarLabel');
const progressBarValue = document.getElementById('progressBarValue');
const downloadSuccessBox = document.getElementById('downloadSuccessBox');
const downloadedTotalCountBadge = document.getElementById('downloadedTotalCountBadge');
const downloadedDirPathText = document.getElementById('downloadedDirPathText');
const btnOpenFolderAfterDone = document.getElementById('btnOpenFolderAfterDone');
const quickOpenFolderBtn = document.getElementById('quickOpenFolderBtn');
const downloadQueueList = document.getElementById('downloadQueueList');
const queueCount = document.getElementById('queueCount');
const toggleLogsBtn = document.getElementById('toggleLogsBtn');
const logsDrawer = document.getElementById('logsDrawer');
const logsIcon = document.getElementById('logsIcon');
const historyList = document.getElementById('historyList');
const btnRefreshHistory = document.getElementById('btnRefreshHistory');

// Modal Elements
const videoModal = document.getElementById('videoModal');
const modalVideoTitle = document.getElementById('modalVideoTitle');
const modalVideoPlayer = document.getElementById('modalVideoPlayer');
const modalVideoMeta = document.getElementById('modalVideoMeta');
const modalDirectDownloadBtn = document.getElementById('modalDirectDownloadBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

// Toast Elements
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const toastIcon = document.getElementById('toastIcon');

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
  if (apiKey) {
    apiKeyInput.value = apiKey;
    apiKeyBanner.classList.add('hidden');
  }

  updateTargetDurationSummary();
  await checkServerStatus();
  loadHistory();

  // Event Listeners
  setupEventListeners();

  // Auto-fetch default category (trending) on initial startup if API key is present
  if (apiKey) {
    fetchDurationBatch();
  }
});

function setupEventListeners() {
  // API Key verification
  verifyApiKeyBtn.addEventListener('click', () => verifyAndSaveApiKey(apiKeyInput.value.trim()));
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verifyAndSaveApiKey(apiKeyInput.value.trim());
  });

  // Open download folder
  openFolderBtn.addEventListener('click', () => openDownloadsFolder());
  btnOpenJobFolder.addEventListener('click', () => openDownloadsFolder());
  if (quickOpenFolderBtn) quickOpenFolderBtn.addEventListener('click', () => openDownloadsFolder());
  if (btnOpenFolderAfterDone) btnOpenFolderAfterDone.addEventListener('click', () => openDownloadsFolder());

  // Tabs switching
  tabSearch.addEventListener('click', () => switchTab('search'));
  tabDownloads.addEventListener('click', () => {
    switchTab('downloads');
    loadHistory();
  });

  // Category Chips click - Auto-trigger video fetch immediately!
  categoryChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      categoryChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const cat = chip.dataset.cat;
      searchInput.value = cat;
      clearSearchBtn.classList.remove('hidden');

      // Auto-trigger fetch videos for selected category!
      fetchDurationBatch();
    });
  });

  // Search input events (Enter key to search)
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchDurationBatch();
    }
  });

  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim().toLowerCase();
    if (val) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }

    // Sync active chip
    categoryChips.querySelectorAll('.chip').forEach(chip => {
      if (chip.dataset.cat.toLowerCase() === val) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    searchInput.focus();
    categoryChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  });

  // Auto re-fetch when orientation or quality filters change
  orientationSelect.addEventListener('change', () => {
    if (currentVideos.length > 0) fetchDurationBatch();
  });
  qualitySelect.addEventListener('change', () => {
    if (currentVideos.length > 0) fetchDurationBatch();
  });

  // Duration input events
  [durHours, durMins, durSecs].forEach(input => {
    input.addEventListener('input', () => {
      updateTargetDurationSummary();
      updateSelectedSummaryBar();
      // Uncheck quick duration highlight if changed manually
      document.querySelectorAll('.quick-dur').forEach(b => b.classList.remove('active-dur'));
    });
  });

  // Quick duration buttons
  document.querySelectorAll('.quick-dur').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.quick-dur').forEach(b => b.classList.remove('active-dur'));
      btn.classList.add('active-dur');
      durHours.value = btn.dataset.hours;
      durMins.value = btn.dataset.mins;
      durSecs.value = 0;
      updateTargetDurationSummary();
      updateSelectedSummaryBar();
    });
  });

  // Concurrency slider
  concurrencyRange.addEventListener('input', () => {
    concurrencyValue.textContent = `${concurrencyRange.value} luồng`;
  });

  // Duration Batch Fetch Trigger
  btnFetchDuration.addEventListener('click', () => fetchDurationBatch());

  // Standard Search Trigger
  btnSearchStandard.addEventListener('click', () => {
    standardPage = 1;
    searchStandard();
  });

  // Pagination
  prevPageBtn.addEventListener('click', () => {
    if (standardPage > 1) {
      standardPage--;
      searchStandard();
    }
  });
  nextPageBtn.addEventListener('click', () => {
    standardPage++;
    searchStandard();
  });

  // Reshuffle selection
  btnReshuffle.addEventListener('click', () => reshuffleCurrentVideos());

  // Select all / Deselect all
  btnSelectAll.addEventListener('click', () => {
    currentVideos.forEach(v => selectedVideoIds.add(v.id));
    renderVideoCards();
    updateSelectedSummaryBar();
  });

  btnDeselectAll.addEventListener('click', () => {
    selectedVideoIds.clear();
    renderVideoCards();
    updateSelectedSummaryBar();
  });

  // Start Batch Download
  btnStartBatchDownload.addEventListener('click', () => startBatchDownload());

  // Cancel Job
  btnCancelJob.addEventListener('click', () => cancelActiveJob());

  // Logs drawer toggle
  toggleLogsBtn.addEventListener('click', () => {
    logsDrawer.classList.toggle('hidden');
    logsIcon.classList.toggle('fa-chevron-down');
    logsIcon.classList.toggle('fa-chevron-up');
  });

  // Refresh history
  btnRefreshHistory.addEventListener('click', () => loadHistory());

  // Video modal close
  closeModalBtn.addEventListener('click', () => closeModal());
  videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) closeModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// Format duration HH:MM:SS
function formatDuration(seconds) {
  const s = Math.round(seconds || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Get user configured target duration in seconds
function getTargetDurationSeconds() {
  const h = parseInt(durHours.value || 0, 10);
  const m = parseInt(durMins.value || 0, 10);
  const s = parseInt(durSecs.value || 0, 10);
  return (h * 3600) + (m * 60) + s;
}

function updateTargetDurationSummary() {
  const totalSecs = getTargetDurationSeconds();
  const formatted = formatDuration(totalSecs);
  targetSummaryText.innerHTML = `Tổng thời gian đặt: <b>${formatted}</b> (${totalSecs} giây)`;
  barTargetDurText.textContent = formatted;
}

// Switch UI tabs
function switchTab(tab) {
  if (tab === 'search') {
    tabSearch.classList.add('border-brand-500', 'text-brand-400');
    tabSearch.classList.remove('border-transparent', 'text-gray-400');
    tabDownloads.classList.remove('border-brand-500', 'text-brand-400');
    tabDownloads.classList.add('border-transparent', 'text-gray-400');
    searchView.classList.remove('hidden');
    downloadsView.classList.add('hidden');
  } else {
    tabDownloads.classList.add('border-brand-500', 'text-brand-400');
    tabDownloads.classList.remove('border-transparent', 'text-gray-400');
    tabSearch.classList.remove('border-brand-500', 'text-brand-400');
    tabSearch.classList.add('border-transparent', 'text-gray-400');
    downloadsView.classList.remove('hidden');
    searchView.classList.add('hidden');
  }
}

// Toast notification
function showToast(message, isError = false) {
  toastMessage.textContent = message;
  toastIcon.className = isError 
    ? 'fa-solid fa-triangle-exclamation text-red-400 text-sm'
    : 'fa-solid fa-circle-check text-brand-400 text-sm';
  toast.classList.add('toast-visible');
  setTimeout(() => {
    toast.classList.remove('toast-visible');
  }, 3500);
}

// Check server and FFmpeg status
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.ffmpegInstalled) {
      ffmpegBadge.innerHTML = `<i class="fa-solid fa-check text-emerald-400 text-[10px]"></i> <span class="text-emerald-300 font-medium">FFmpeg: Sẵn sàng (Ghép video OK)</span>`;
      ffmpegBadge.className = "flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400";
    } else {
      ffmpegBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-400 text-[10px]"></i> <span class="text-amber-300">FFmpeg: Chưa có (Chỉ tải video)</span>`;
      ffmpegBadge.className = "flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400";
    }

    if (data.downloadsDir) {
      openFolderBtn.title = `Thư mục tải: ${data.downloadsDir}`;
    }

    // Auto-fill API key from server .env if not yet in localStorage
    if (!apiKey && data.defaultApiKey) {
      apiKey = data.defaultApiKey;
      apiKeyInput.value = apiKey;
      localStorage.setItem('pexels_api_key', apiKey);
      apiKeyBanner.classList.add('hidden');
    }
  } catch (err) {
    ffmpegBadge.innerHTML = `<i class="fa-solid fa-xmark text-red-400 text-[10px]"></i> <span class="text-red-400">Server offline</span>`;
  }
}

// Verify API Key
async function verifyAndSaveApiKey(key) {
  if (!key) {
    showToast('Vui lòng nhập Pexels API Key!', true);
    return;
  }

  // Detect if user pasted remember_user_token or browser cookie instead of API key
  if (key.includes('eyJfcmFpbHMi') || key.includes('remember_user_token') || (key.length > 80 && key.includes('--'))) {
    showToast('Đây là Cookie đăng nhập (remember_user_token), không phải API Key!', true);
    alert('⚠️ LƯU Ý QUAN TRỌNG:\n\nChuỗi bạn vừa nhập là Cookie phiên đăng nhập của trình duyệt (remember_user_token).\n\nPexels API chỉ chấp nhận API Key chính thức (dạng 56 ký tự chữ và số).\n\n👉 Vì bạn ĐÃ ĐĂNG NHẬP SẴN trên trình duyệt, bạn chỉ cần bấm vào link sau:\nhttps://www.pexels.com/api/documentation/\n\nỞ đầu trang sẽ hiện ngay dòng "Your API Key" hoặc ô "Authorization: YOUR_KEY". Hãy sao chép chuỗi 56 ký tự đó và dán vào đây!');
    return;
  }

  verifyApiKeyBtn.disabled = true;
  verifyApiKeyBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-[10px]"></i> <span>Đang thử...</span>`;

  try {
    const res = await fetch('/api/verify-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key })
    });
    const data = await res.json();

    if (data.valid) {
      apiKey = key;
      localStorage.setItem('pexels_api_key', key);
      apiKeyBanner.classList.add('hidden');
      showToast('API Key hợp lệ! Đã lưu thành công.');
    } else {
      showToast(`API Key không hợp lệ: ${data.error}`, true);
    }
  } catch (err) {
    showToast(`Lỗi kết nối kiểm tra API key: ${err.message}`, true);
  } finally {
    verifyApiKeyBtn.disabled = false;
    verifyApiKeyBtn.innerHTML = `<i class="fa-solid fa-check text-[11px]"></i> <span>Lưu & Kiểm tra</span>`;
  }
}

// Open Downloads Folder
async function openDownloadsFolder(folderPath) {
  try {
    const res = await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã mở thư mục trong Windows Explorer');
    }
  } catch (err) {
    showToast(`Không thể mở thư mục: ${err.message}`, true);
  }
}

// -------------------------------------------------------------
// FETCH DURATION BATCH (Requirements 3, 5, 6)
// -------------------------------------------------------------
async function fetchDurationBatch() {
  if (!apiKey) {
    showToast('Vui lòng nhập Pexels API Key trước!', true);
    apiKeyInput.focus();
    return;
  }

  const query = searchInput.value.trim() || 'trending';
  const targetSeconds = getTargetDurationSeconds();
  if (targetSeconds <= 0) {
    showToast('Vui lòng nhập tổng thời gian lớn hơn 0 giây!', true);
    durHours.focus();
    return;
  }

  const orientation = orientationSelect.value;
  const preferredQuality = qualitySelect.value;
  const shuffle = shuffleCheck.checked;

  currentSearchMode = 'duration';
  standardPagination.classList.add('hidden');
  emptyResults.classList.add('hidden');
  videoCardsGrid.classList.add('hidden');
  selectionSummaryBar.classList.add('hidden');
  searchLoading.classList.remove('hidden');

  loadingTitle.textContent = `Đang gom video [${query}] cho đủ ${formatDuration(targetSeconds)}...`;
  loadingDesc.textContent = `Đang gọi Pexels API nhiều trang, lọc chất lượng ${preferredQuality.toUpperCase()} và xáo trộn ngẫu nhiên...`;

  try {
    const res = await fetch('/api/fetch-duration-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify({
        query,
        targetDurationSeconds: targetSeconds,
        orientation,
        preferredQuality,
        shuffle,
        maxPages: Math.max(5, Math.ceil(targetSeconds / 300)) // adaptive page fetch limit
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Lỗi lấy video từ Pexels');
    }

    currentVideos = data.videos || [];
    selectedVideoIds = new Set(currentVideos.map(v => v.id));

    searchLoading.classList.add('hidden');

    if (currentVideos.length === 0) {
      emptyResults.classList.remove('hidden');
      showToast('Không tìm thấy video nào phù hợp!', true);
      return;
    }

    renderVideoCards();
    updateSelectedSummaryBar();
    selectionSummaryBar.classList.remove('hidden');
    showToast(`Đã gom được ${currentVideos.length} clip (Tổng: ${formatDuration(data.selectedDuration)})!`);
  } catch (err) {
    searchLoading.classList.add('hidden');
    emptyResults.classList.remove('hidden');
    showToast(`Lỗi: ${err.message}`, true);
  }
}

// -------------------------------------------------------------
// STANDARD PAGINATED SEARCH
// -------------------------------------------------------------
async function searchStandard() {
  if (!apiKey) {
    showToast('Vui lòng nhập Pexels API Key trước!', true);
    apiKeyInput.focus();
    return;
  }

  const query = searchInput.value.trim();
  const orientation = orientationSelect.value;
  const preferredQuality = qualitySelect.value;

  currentSearchMode = 'standard';
  emptyResults.classList.add('hidden');
  videoCardsGrid.classList.add('hidden');
  searchLoading.classList.remove('hidden');

  loadingTitle.textContent = `Đang tìm kiếm trang ${standardPage}...`;
  loadingDesc.textContent = `Đang tải 20 video chất lượng cao từ Pexels API...`;

  try {
    const params = new URLSearchParams({
      query,
      orientation,
      page: standardPage,
      per_page: 24
    });

    const res = await fetch(`/api/search?${params.toString()}`, {
      headers: { 'Authorization': apiKey }
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Lỗi tìm kiếm');

    const rawVideos = data.videos || [];
    currentVideos = rawVideos.map(v => {
      const best = (v.video_files || []).find(f => f.quality === 'hd') || (v.video_files || [])[0];
      return {
        id: v.id,
        duration: v.duration || 15,
        width: v.width,
        height: v.height,
        image: v.image,
        url: v.url,
        user: v.user,
        video_file: best,
        all_files: v.video_files
      };
    });

    // Auto select all in standard mode
    selectedVideoIds = new Set(currentVideos.map(v => v.id));

    searchLoading.classList.add('hidden');

    if (currentVideos.length === 0) {
      emptyResults.classList.remove('hidden');
      standardPagination.classList.add('hidden');
      selectionSummaryBar.classList.add('hidden');
      return;
    }

    renderVideoCards();
    updateSelectedSummaryBar();
    selectionSummaryBar.classList.remove('hidden');

    // Pagination controls
    standardPagination.classList.remove('hidden');
    pageIndicatorText.textContent = `Trang ${standardPage} (Tổng: ${data.total_results || 'nhiều'} video)`;
    prevPageBtn.disabled = standardPage <= 1;
    nextPageBtn.disabled = !data.next_page;
  } catch (err) {
    searchLoading.classList.add('hidden');
    emptyResults.classList.remove('hidden');
    showToast(`Lỗi: ${err.message}`, true);
  }
}

// Reshuffle current loaded videos
function reshuffleCurrentVideos() {
  for (let i = currentVideos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentVideos[i], currentVideos[j]] = [currentVideos[j], currentVideos[i]];
  }
  renderVideoCards();
  showToast('Đã xáo trộn thứ tự các clip ngẫu nhiên!');
}

// Render Video Cards in Results Grid
function renderVideoCards() {
  videoCardsGrid.innerHTML = '';
  videoCardsGrid.classList.remove('hidden');

  currentVideos.forEach((video, index) => {
    const isSelected = selectedVideoIds.has(video.id);
    const card = document.createElement('div');
    card.className = `video-card bg-dark-850 rounded-2xl border ${isSelected ? 'border-brand-500/60 ring-1 ring-brand-500/30' : 'border-dark-750'} overflow-hidden flex flex-col`;
    card.dataset.id = video.id;

    const previewUrl = video.video_file ? video.video_file.link : '';
    const resolution = video.video_file ? `${video.video_file.width}x${video.video_file.height}` : `${video.width}x${video.height}`;
    const author = video.user ? video.user.name : 'Pexels Creator';

    card.innerHTML = `
      <!-- Thumbnail & Play Overlay -->
      <div class="relative aspect-video bg-dark-900 overflow-hidden group cursor-pointer thumbnail-container">
        <img src="${video.image}" alt="Preview" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy">
        
        <!-- Duration badge -->
        <div class="absolute bottom-2 right-2 bg-black/80 backdrop-blur text-white text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
          <i class="fa-solid fa-clock text-[9px] text-brand-400"></i> ${formatDuration(video.duration)}
        </div>

        <!-- Resolution badge -->
        <div class="absolute top-2 left-2 bg-dark-900/80 backdrop-blur text-gray-300 text-[10px] font-semibold px-1.5 py-0.5 rounded">
          ${resolution}
        </div>

        <!-- Play overlay button -->
        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          <button class="play-preview-btn w-11 h-11 rounded-full bg-brand-500/90 text-white flex items-center justify-center text-sm shadow-lg hover:scale-110 transition">
            <i class="fa-solid fa-play ml-0.5"></i>
          </button>
        </div>

        <!-- Checkbox selector -->
        <div class="absolute top-2 right-2 z-10">
          <input type="checkbox" class="video-checkbox w-5 h-5 rounded text-brand-500 focus:ring-brand-500 bg-dark-900/90 border-dark-600 cursor-pointer" 
            ${isSelected ? 'checked' : ''}>
        </div>
      </div>

      <!-- Info Footer -->
      <div class="p-3 flex-1 flex flex-col justify-between space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400 font-medium truncate max-w-[140px]" title="${author}">
            <i class="fa-regular fa-user mr-1 text-[10px]"></i> ${author}
          </span>
          <span class="text-[11px] font-semibold text-emerald-400">#${index + 1}</span>
        </div>

        <div class="flex items-center justify-between pt-1 border-t border-dark-800 text-xs">
          <button class="preview-btn text-gray-400 hover:text-white flex items-center gap-1 text-[11px]">
            <i class="fa-solid fa-eye text-brand-400"></i> Xem
          </button>
          <a href="${previewUrl}" target="_blank" download="pexels_${video.id}.mp4" class="text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium text-[11px]">
            <i class="fa-solid fa-download"></i> Tải clip
          </a>
        </div>
      </div>
    `;

    // Event: Toggle Checkbox
    const checkbox = card.querySelector('.video-checkbox');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleVideoSelection(video.id, checkbox.checked, card);
    });

    // Event: Click Preview
    const playBtn = card.querySelector('.play-preview-btn');
    const previewBtn = card.querySelector('.preview-btn');
    const triggerPreview = () => openModal(video, previewUrl, resolution);
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerPreview();
    });
    previewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerPreview();
    });

    videoCardsGrid.appendChild(card);
  });
}

function toggleVideoSelection(id, checked, card) {
  if (checked) {
    selectedVideoIds.add(id);
    card.classList.add('border-brand-500/60', 'ring-1', 'ring-brand-500/30');
    card.classList.remove('border-dark-750');
  } else {
    selectedVideoIds.delete(id);
    card.classList.remove('border-brand-500/60', 'ring-1', 'ring-brand-500/30');
    card.classList.add('border-dark-750');
  }
  updateSelectedSummaryBar();
}

function updateSelectedSummaryBar() {
  const selectedVideos = currentVideos.filter(v => selectedVideoIds.has(v.id));
  const count = selectedVideos.length;
  const totalSeconds = selectedVideos.reduce((acc, v) => acc + (v.duration || 0), 0);
  const targetSeconds = getTargetDurationSeconds();

  selectedCountBadge.textContent = count;
  selectedCountText.textContent = `${count} clip`;
  totalSelectedDurationText.textContent = formatDuration(totalSeconds);

  if (targetSeconds > 0) {
    const percent = Math.round((totalSeconds / targetSeconds) * 100);
    durationMatchBadge.textContent = `${percent}% Mục tiêu`;
    if (percent >= 100) {
      durationMatchBadge.className = 'text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold';
    } else {
      durationMatchBadge.className = 'text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold';
    }
  }

  const labelText = `TẢI XUỐNG ${count} VIDEO (${formatDuration(totalSeconds)})`;

  let btnText = document.getElementById('btnStartBatchText');
  if (btnText) {
    btnText.textContent = labelText;
  } else if (btnStartBatchDownload) {
    btnStartBatchDownload.innerHTML = `<i class="fa-solid fa-cloud-arrow-down text-sm"></i> <span id="btnStartBatchText">${labelText}</span>`;
  }
}

// -------------------------------------------------------------
// START BATCH DOWNLOAD (Requirements 4, 5, 6, 8)
// -------------------------------------------------------------
async function startBatchDownload() {
  const selectedVideos = currentVideos.filter(v => selectedVideoIds.has(v.id));
  if (selectedVideos.length === 0) {
    showToast('Vui lòng chọn ít nhất 1 video để tải!', true);
    return;
  }

  const query = searchInput.value.trim() || 'pexels_batch';
  const concurrency = parseInt(concurrencyRange.value, 10) || 6;
  const preferredQuality = qualitySelect.value;
  const targetDurationSeconds = getTargetDurationSeconds();
  const shuffle = shuffleCheck ? shuffleCheck.checked : true;

  // Slim down video objects to prevent 413 Payload Too Large on large batches (100-300 videos)
  const slimVideos = selectedVideos.map(v => ({
    id: v.id,
    duration: v.duration,
    width: v.width,
    height: v.height,
    video_file: v.video_file ? {
      link: v.video_file.link,
      width: v.video_file.width,
      height: v.video_file.height,
      quality: v.video_file.quality,
      file_type: v.video_file.file_type
    } : null,
    video_files: v.all_files || v.video_files ? (v.all_files || v.video_files).map(f => ({
      link: f.link,
      width: f.width,
      height: f.height,
      quality: f.quality,
      file_type: f.file_type
    })) : undefined
  }));

  btnStartBatchDownload.disabled = true;
  btnStartBatchDownload.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-sm"></i> <span id="btnStartBatchText">Đang khởi tạo...</span>`;

  try {
    const res = await fetch('/api/download/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videos: slimVideos,
        jobName: query,
        concurrency,
        preferredQuality,
        merge: false, // User requested: only download individual videos, no merge
        targetDurationSeconds,
        trimExact: false,
        shuffle
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể bắt đầu tải');

    activeJobId = data.jobId;
    showToast(`Đã bắt đầu tải ${data.totalVideos} video!`);

    // Switch to Downloads Tab and connect SSE
    switchTab('downloads');
    activeJobIndicator.classList.remove('hidden');
    connectJobSSE(activeJobId);
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, true);
  } finally {
    btnStartBatchDownload.disabled = false;
    updateSelectedSummaryBar();
  }
}

// Connect SSE for Real-time Progress Tracking
function connectJobSSE(jobId) {
  if (sseSource) {
    sseSource.close();
  }

  // Reset UI elements
  if (downloadSuccessBox) downloadSuccessBox.classList.add('hidden');
  overallProgressBar.style.width = '0%';
  statProgressPercent.textContent = '0%';
  statSpeed.textContent = '0.0 MB/s';
  logsDrawer.innerHTML = '';

  sseSource = new EventSource(`/api/download/progress/${jobId}`);

  sseSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleJobEvent(payload);
    } catch (err) {
      console.error('SSE JSON error:', err);
    }
  };

  sseSource.onerror = () => {
    console.warn('SSE connection closed or lost');
  };
}

function handleJobEvent(payload) {
  const type = payload.type;

  if (type === 'snapshot') {
    renderJobSnapshot(payload.job);
  } else if (type === 'progress_tick') {
    // Update individual video item progress
    const vidEl = document.getElementById(`queueItem_${payload.video.index}`);
    if (vidEl) {
      const pBar = vidEl.querySelector('.v-progress-bar');
      const pText = vidEl.querySelector('.v-progress-text');
      if (pBar) pBar.style.width = `${payload.video.progress}%`;
      if (pText) pText.textContent = `${payload.video.progress}%`;
    }

    // Update overall stats
    statProgressPercent.textContent = `${payload.overall.progressPercent}%`;
    overallProgressBar.style.width = `${payload.overall.progressPercent}%`;
    progressBarValue.textContent = `${payload.overall.progressPercent}%`;

    const mbSpeed = (payload.overall.speedBps / (1024 * 1024)).toFixed(1);
    statSpeed.textContent = `${mbSpeed} MB/s`;

    const mbTotal = (payload.overall.totalDownloaded / (1024 * 1024)).toFixed(1);
    statDownloadedBytes.textContent = `${mbTotal} MB`;
  } else if (type === 'video_update') {
    updateQueueItemStatus(payload.video);
  } else if (type === 'merge_status') {
    ffmpegMergeProgressBox.classList.remove('hidden');
    activeJobStatusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1.5';
    activeJobStatusBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-[10px]"></i> Đang gộp video (FFmpeg)`;
    progressBarLabel.textContent = 'Hoàn tất tải file & Đang gộp thành 1 video duy nhất...';
  } else if (type === 'merge_progress') {
    ffmpegMergeProgressBox.classList.remove('hidden');
    ffmpegProgressBar.style.width = `${payload.percent}%`;
    ffmpegPercentText.textContent = `${payload.percent}%`;
    if (payload.currentStep) ffmpegStepText.textContent = payload.currentStep;
  } else if (type === 'log') {
    appendLog(payload.log);
  } else if (type === 'completed') {
    handleJobCompleted(payload.job);
  } else if (type === 'cancelled') {
    activeJobStatusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30';
    activeJobStatusBadge.innerHTML = `<i class="fa-solid fa-ban"></i> Đã hủy`;
    showToast('Tiến trình tải đã bị hủy', true);
  }
}

function renderJobSnapshot(job) {
  activeJobTitle.textContent = `Batch: ${job.name}`;
  activeJobPath.textContent = `Thư mục: ${job.dir}`;
  activeJobPath.title = job.dir;

  btnOpenJobFolder.onclick = () => openDownloadsFolder(job.dir);

  statCompletedCount.textContent = `${job.completedVideos} / ${job.totalVideos} clip`;
  statDuration.textContent = formatDuration(job.totalPlannedDuration);
  statMergeStatus.textContent = `Gộp 1 video: ${job.merge ? 'BẬT' : 'TẮT'}`;
  queueCount.textContent = job.videos.length;

  // Render individual queue items
  downloadQueueList.innerHTML = '';
  job.videos.forEach(v => {
    const item = document.createElement('div');
    item.id = `queueItem_${v.index}`;
    item.className = 'flex items-center justify-between p-2.5 bg-dark-900 border border-dark-750 rounded-xl text-xs';
    item.innerHTML = `
      <div class="flex items-center space-x-3 truncate">
        <span class="w-6 text-gray-500 font-mono font-bold">#${v.index}</span>
        <div class="truncate">
          <div class="font-medium text-white truncate max-w-xs">${v.filename}</div>
          <div class="text-[11px] text-gray-400">${formatDuration(v.duration)} &bull; ${v.quality}</div>
        </div>
      </div>

      <div class="flex items-center space-x-3 w-44 justify-end">
        <div class="w-24 bg-dark-800 rounded-full h-2 overflow-hidden border border-dark-700">
          <div class="v-progress-bar h-full bg-brand-500 transition-all duration-200" style="width: ${v.progress}%"></div>
        </div>
        <span class="v-progress-text w-8 text-right font-mono text-gray-300 text-[11px]">${v.progress}%</span>
        <span class="v-status-badge text-[12px] w-5 text-center">
          ${getStatusIcon(v.status)}
        </span>
      </div>
    `;
    downloadQueueList.appendChild(item);
  });

  // Render previous logs
  (job.logs || []).forEach(appendLog);
}

function getStatusIcon(status) {
  if (status === 'completed') return '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
  if (status === 'downloading') return '<i class="fa-solid fa-circle-notch fa-spin text-brand-400"></i>';
  if (status === 'failed') return '<i class="fa-solid fa-circle-xmark text-red-400"></i>';
  return '<i class="fa-regular fa-clock text-gray-500"></i>';
}

function updateQueueItemStatus(video) {
  const item = document.getElementById(`queueItem_${video.index}`);
  if (!item) return;

  const pBar = item.querySelector('.v-progress-bar');
  const pText = item.querySelector('.v-progress-text');
  const sBadge = item.querySelector('.v-status-badge');

  if (pBar) pBar.style.width = `${video.progress}%`;
  if (pText) pText.textContent = `${video.progress}%`;
  if (sBadge) sBadge.innerHTML = getStatusIcon(video.status);
}

function appendLog(log) {
  const line = document.createElement('div');
  line.className = 'flex items-start space-x-2 leading-relaxed';
  const colorClass = log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-400' : log.level === 'success' ? 'text-emerald-400' : 'text-gray-300';
  line.innerHTML = `<span class="text-gray-500 select-none">[${log.time}]</span> <span class="${colorClass}">${log.message}</span>`;
  logsDrawer.appendChild(line);
  logsDrawer.scrollTop = logsDrawer.scrollHeight;
}

function handleJobCompleted(job) {
  activeJobIndicator.classList.add('hidden');
  statProgressPercent.textContent = '100%';
  overallProgressBar.style.width = '100%';
  progressBarValue.textContent = '100%';
  statSpeed.textContent = '0.0 MB/s';

  activeJobStatusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5';
  activeJobStatusBadge.innerHTML = `<i class="fa-solid fa-check text-[10px]"></i> Đã tải xong`;

  if (downloadSuccessBox) {
    downloadSuccessBox.classList.remove('hidden');
    if (downloadedTotalCountBadge) downloadedTotalCountBadge.textContent = `${job.completedVideos} video`;
    if (downloadedDirPathText) downloadedDirPathText.textContent = job.dir;
    if (btnOpenFolderAfterDone) btnOpenFolderAfterDone.onclick = () => openDownloadsFolder(job.dir);
  }

  showToast(`🎉 Đã tải hoàn tất ${job.completedVideos} video vào thư mục!`);
  loadHistory();
}

async function cancelActiveJob() {
  if (!activeJobId) return;
  if (!confirm('Bạn có chắc chắn muốn hủy tiến trình tải này?')) return;

  try {
    await fetch(`/api/download/cancel/${activeJobId}`, { method: 'POST' });
    showToast('Đang hủy tiến trình...');
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, true);
  }
}

// -------------------------------------------------------------
// HISTORY SECTION
// -------------------------------------------------------------
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const folders = await res.json();

    if (!folders || folders.length === 0) {
      historyList.innerHTML = `<div class="py-6 text-center text-gray-500">Chưa có đợt tải nào trong thư mục.</div>`;
      return;
    }

    historyList.innerHTML = '';
    folders.forEach(item => {
      const row = document.createElement('div');
      row.className = 'py-3 flex flex-wrap items-center justify-between gap-2';
      const dateStr = new Date(item.createdAt).toLocaleString('vi-VN');

      row.innerHTML = `
        <div>
          <div class="font-medium text-white flex items-center gap-2">
            <i class="fa-regular fa-folder text-brand-400"></i> ${item.folderName}
          </div>
          <div class="text-[11px] text-gray-400 mt-0.5 font-mono">
            ${item.videoCount} files MP4 &bull; ${dateStr}
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <button class="open-folder-btn px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 text-xs transition flex items-center gap-1.5">
            <i class="fa-regular fa-folder-open text-brand-400"></i> Mở thư mục
          </button>
        </div>
      `;

      row.querySelector('.open-folder-btn').onclick = () => openDownloadsFolder(item.folderPath);
      historyList.appendChild(row);
    });
  } catch (err) {
    historyList.innerHTML = `<div class="py-6 text-center text-red-400">Lỗi tải lịch sử: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// VIDEO PLAYER MODAL
// -------------------------------------------------------------
function openModal(video, videoSrc, metaInfo) {
  modalVideoTitle.textContent = video.user ? `Tác giả: ${video.user.name}` : 'Xem trước video';
  modalVideoMeta.textContent = metaInfo || `Thời lượng: ${formatDuration(video.duration)}`;
  modalDirectDownloadBtn.href = videoSrc;
  modalDirectDownloadBtn.download = `video_${video.id || 'clip'}.mp4`;

  modalVideoPlayer.src = videoSrc;
  modalVideoPlayer.load();
  modalVideoPlayer.play().catch(() => {});

  videoModal.classList.remove('hidden');
}

function closeModal() {
  modalVideoPlayer.pause();
  modalVideoPlayer.src = '';
  videoModal.classList.add('hidden');
}
