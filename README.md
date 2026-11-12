# 🎬 Pexels Video Studio - Batch Downloader & Merger

Công cụ Web chuyên nghiệp để tìm kiếm, gom video theo danh mục (Category), xáo trộn ngẫu nhiên (Shuffle), tự động gom đủ tổng thời lượng (ví dụ: 2 tiếng), tải siêu tốc đa luồng (Multi-threading), và gộp tất cả thành 1 video MP4 duy nhất bằng FFmpeg.

---

## ✨ Tính năng nổi bật

1. **Tích hợp Pexels API chính thức**:
   - Tìm kiếm video theo danh mục (Nature, Ocean, City, Tech, Space, Drone, Lo-Fi, Animals, Food, Fitness...).
   - Hỗ trợ xem video thịnh hành (Popular / Trending).
   - Lọc theo định hướng: Ngang (16:9 cho PC/YouTube), Dọc (9:16 cho TikTok/Reels/Shorts), Vuông (1:1).
   - Chọn độ phân giải ưu tiên: Full HD 1080p, 4K UHD, hoặc SD.

2. **Gom video theo Tổng thời lượng (Target Duration)**:
   - Nhập thời lượng mong muốn (ví dụ: 2 giờ 00 phút, 1 giờ 30 phút, 45 phút...).
   - Tự động lướt qua nhiều trang kết quả của Pexels API, tính toán thời lượng từng clip và gom đủ tổng thời gian đặt.

3. **Xáo trộn ngẫu nhiên (Shuffle)**:
   - Thuật toán Fisher-Yates xáo trộn các clip từ nhiều trang và tác giả khác nhau, tránh thứ tự rập khuôn.
   - Nút **Đổi thứ tự (Shuffle)** trên giao diện cho phép đảo lại thứ tự bất kỳ lúc nào.

4. **Gộp thành 1 Video duy nhất (Video Merger with FFmpeg)**:
   - Tự động chuẩn hóa kích thước, tỷ lệ khung hình và FPS (1080p @ 30fps).
   - Ghép nối siêu tốc các clip thành 1 file MP4 hoàn chỉnh.
   - Tùy chọn **Cắt chuẩn thời lượng (Trim exact)**: Tự động cắt đúng số giây mục tiêu (ví dụ chuẩn 2 tiếng 00 phút 00 giây không bị dư).

5. **Tải siêu tốc đa luồng (Multi-Threaded Parallel Downloads)**:
   - Tùy chỉnh số luồng tải cùng lúc từ 2 đến 12 luồng song song.
   - Theo dõi tiến độ thời gian thực (Real-time speed MB/s, dung lượng đã tải, % tiến độ từng file và tổng thể qua Server-Sent Events).

6. **Giao diện hiện đại & Tiện ích**:
   - Xem trước video (Video Player Modal) trước khi tải hoặc xem video đã gộp ngay trên trình duyệt.
   - Nút **Mở thư mục tải** trực tiếp trong Windows File Explorer.
   - Lịch sử các đợt tải trước đó.

---

## 🚀 Hướng dẫn khởi động nhanh

### Cách 1: Chạy file `start.bat`
Chỉ cần nhấp đúp vào file `start.bat` trong thư mục dự án. Trình duyệt sẽ tự động mở trang web tại:
`http://localhost:3050`

### Cách 2: Chạy bằng lệnh Terminal
```bash
# Cài đặt thư viện (nếu chưa cài)
npm install

# Khởi động server
npm start
```
Truy cập: `http://localhost:3050`

---

## 🔑 Hướng dẫn lấy Pexels API Key miễn phí

1. Truy cập [Pexels API Portal](https://www.pexels.com/api/new/).
2. Đăng ký hoặc đăng nhập tài khoản Pexels miễn phí.
3. Điền thông tin ứng dụng cơ bản và nhận API Key ngay lập tức.
4. Dán API Key vào ô trên thanh tiêu đề của web tool và nhấn **Lưu & Kiểm tra**. Key sẽ được lưu vào trình duyệt của bạn cho các lần sử dụng sau.

---

## 🛠️ Cấu trúc dự án

```
tool-pexels-api/
├── server.js            # Express API server, SSE streamer, Download Queue & FFmpeg Merger
├── public/
│   ├── index.html       # Giao diện Web Dashboard (Tailwind CSS, FontAwesome)
│   ├── app.js           # Xử lý tương tác, gọi API, tính toán thời lượng, SSE
│   └── styles.css       # Hiệu ứng, thanh cuộn tùy biến
├── downloads/           # Thư mục lưu các video tải về và video gộp
├── start.bat            # File chạy nhanh trên Windows
├── package.json
└── README.md
```
