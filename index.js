/** Khai báo module express dùng để tạo web server */
const EXPRESS = require("express");

/** Khai báo thư viện got để tạo các HTTP request */
const GOT = require("got").default;

/** Khai báo thư viện sharp để xử lý hình ảnh */
const SHARP = require("sharp");

/** Khai báo thư viện cheerio để bóc tách mã HTML */
const CHEERIO = require("cheerio");

/** Khai báo hàm khởi tạo và cấu hình thư viện metascraper với các plugin cần thiết */
const META_SCRAPER = require("metascraper")([
  require("metascraper-audio")(),
  require("metascraper-author")(),
  require("metascraper-date")(),
  require("metascraper-description")(),
  require("metascraper-feed")(),
  require("metascraper-iframe")(),
  require("metascraper-image")(),
  require("metascraper-lang")(),
  require("metascraper-logo-favicon")(),
  require("metascraper-logo")(),
  require("metascraper-manifest")(),
  require("metascraper-media-provider")(),
  require("metascraper-publisher")(),
  require("metascraper-readability")(),
  require("metascraper-title")(),
  require("metascraper-url")(),
  require("metascraper-video")(),
]);

/** Khởi tạo ứng dụng express */
const APP = EXPRESS();

/** Khai báo hằng số chạy cổng 3000 cho server */
const PORT = 3000;

// ------------------------
// Utils
// ------------------------

/**
 * Hàm định dạng số byte sang đơn vị đo dung lượng phù hợp (B, kB, MB, GB)
 * @param {number} bytes Số byte cần định dạng
 * @returns {string} Trả về chuỗi dung lượng đã định dạng
 */
function formatBytes(bytes) {
  // Nếu tham số truyền vào rỗng thì trực tiếp trả về 0 B
  if (!bytes) return "0 B";

  /** Khai báo hằng số cơ số quy đổi mỗi bậc dữ liệu là 1024 */
  const K_FACTOR = 1024;

  /** Khai báo mảng các tiền tố đo lường dữ liệu máy tính lớn nhỏ */
  const SIZES = ["B", "kB", "MB", "GB"];

  /** Khai báo và tính toán chỉ số mảng ứng với số bậc quy đổi dữ liệu logarit */
  const INDEX = Math.floor(Math.log(bytes) / Math.log(K_FACTOR));

  // Ráp và tính toán cùng đơn vị và chuỗi số thập phân được làm tròn giới hạn 1 vị trí
  return (bytes / Math.pow(K_FACTOR, INDEX)).toFixed(1) + " " + SIZES[INDEX];
}

// ------------------------
// Image Enrichment (NO PALETTE)
// ------------------------

/**
 * Hàm làm giàu và lấy ra chi tiết thông tin của file ảnh qua URL
 * @param {string} imageUrl đoạn đường dẫn URL của hình ảnh
 * @returns {Promise<Object|null>} Nhận lại thông tin file hình ảnh
 */
async function enrichImage(imageUrl) {
  // Đưa vào khối Try catch bắt lỗi an toàn khi xử lý hình ảnh
  try {
    /** Khai báo và chờ thư viện gọi vào URL truyền vào lấy phản hồi buffer */
    const RESPONSE = await GOT(imageUrl, {
      responseType: "buffer",
      timeout: { request: 10000 },
      headers: { "user-agent": "Mozilla/5.0" },
    });

    /** Khai báo nội dung trường content-type trong thông điệp phản hồi HTTP */
    const CONTENT_TYPE = RESPONSE.headers["content-type"] || "";

    /** Khai báo chứa dữ liệu thô của file ảnh vào biến buffer */
    const BUFFER = RESPONSE.body;

    /** Khai báo giá trị chiều dài của dữ liệu thô làm dung lượng nội tại của file */
    const SIZE = BUFFER.length;

    // Xét logic nếu URL có đuôi là .ico thì đặc cách trả về luôn vì thư viện sharp parse loại này phức tạp
    if (imageUrl.toLowerCase().endsWith(".ico")) {
      return {
        url: imageUrl,
        type: "ico",
        width: null,
        height: null,
        size: SIZE,
        size_pretty: formatBytes(SIZE),
      };
    }

    // Nếu Content-Type không định dạng đúng là image ảnh thì trả giá trị null dừng xử lý chức năng
    if (!CONTENT_TYPE.startsWith("image/")) return null;

    /** Khai báo biến trích xuất đặc thù metadata của bức ảnh từ buffer bằng module sharp */
    const META = await SHARP(BUFFER).metadata();

    // Trả lên kết quả với bao gồm định dạng, width, height vừa lấy ra được
    return {
      url: imageUrl,
      type: META.format,
      width: META.width,
      height: META.height,
      size: SIZE,
      size_pretty: formatBytes(SIZE),
    };
  } catch {
    // Nếu có xảy ra lỗi nào đó ở khối code phía trên thì trả ra null bảo vệ crash
    return null;
  }
}

// ------------------------
// Favicon Detection
// ------------------------

/**
 * Tìm trích xuất và Truyệt HTML để lấy đường link favicon
 * @param {string} html Document HTML dưới dạng cấu trúc chuỗi
 * @param {string} pageUrl URL tuyệt đối trang web đang cào dữ liệu
 * @returns {Promise<Object|null>} Trả cấu trúc Object thông tin favicon
 */
async function detectFavicon(html, pageUrl) {
  // Thử tiến hành làm truyệt và xử lý trong khối bao try
  try {
    /** Khai báo nạp document HTML vào thư viện cheerio để parse hỗ trợ lấy element */
    const CHEERIO_DOC = CHEERIO.load(html);

    /** Khai báo và gán tự động lấy giá trị thẻ link trên header theo các định nghĩa selector icon */
    let icon_href =
      CHEERIO_DOC('link[rel="icon"]').attr("href") ||
      CHEERIO_DOC('link[rel="shortcut icon"]').attr("href") ||
      CHEERIO_DOC('link[rel="apple-touch-icon"]').attr("href") ||
      "/favicon.ico";

    /** Khai báo và tạo cấu trúc URL tuyệt đối dành cho favicon từ icon vừa bắt được */
    const FAVICON_URL = new URL(icon_href, pageUrl).href;

    // Đưa link url tuyệt đối tìm đó qua cho hàm hỗ trợ enrich ảnh để lấy thông số kỹ thuật kích thước
    return await enrichImage(FAVICON_URL);
  } catch {
    // Gặp ngoại lệ parse bị lỗi hay enrich ảnh parse lỗi thất bại thì catch trả ra null
    return null;
  }
}

// ------------------------
// Core Scraper
// ------------------------

/**
 * Xử lý hàm bóc tách toàn bộ thông tin quan trọng nhất bằng metascraper qua URL nhập
 * @param {string} url Đầu vào là chuỗi url của trang web
 * @returns {Promise<Object>} Trả ra nội dung tổng hợp thông tin trang web
 */
async function scrape(url) {
  /** Khai báo và chờ thư viện got gửi lên lấy response trực tiếp vào đường link truyền vào qua method Get */
  const RESPONSE = await GOT(url, {
    timeout: { request: 15000 },
    headers: { "user-agent": "Mozilla/5.0" },
    followRedirect: true,
  });

  /** Khai báo thuộc tính URL nhận được cuối cùng để đối chiếu khi server trang web thực hiện redirect điều hướng */
  const FINAL_URL = RESPONSE.url;

  /** Khai báo và lưu lấy dữ liệu trường content type định dạng tải về trong headers */
  const CONTENT_TYPE = RESPONSE.headers["content-type"] || "";

  // 🟢 Kiểm tra logic nếu định dạng của trang link gốc truyền vào vốn dĩ gọi thẳng đường sinh trực tiếp tới ảnh
  if (CONTENT_TYPE.startsWith("image/")) {
    /** Khai báo cho biến ảnh được làm giàu bằng cách gọi thẳng enrichImage sử dụng URL cuối đó */
    const IMAGE = await enrichImage(FINAL_URL);

    // Xây dựng luôn bộ tham số kết quả và trả về dành cho kiểu dữ liệu image
    return {
      lang: "en",
      author: null,
      title: FINAL_URL.split("/").pop(),
      publisher: new URL(FINAL_URL).hostname,
      image: IMAGE,
      date: RESPONSE.headers["last-modified"] || null,
      description: null,
      url: FINAL_URL,
      audio: null,
      logo: null,
      iframe: null,
      video: null,
    };
  }

  // 🟢 Kiểm tra logic trường hợp này sẽ trả html giống như cách chúng ta load và trình duyệt đọc web bình thường
  /** Khai báo dữ liệu html bằng nội dung truy xuất từ biến body ở trên */
  const HTML = RESPONSE.body;

  /** Khai báo dữ liệu phân bổ từ plugin metascraper vào biến META chạy cho URL cùng bộ body text html vừa rồi */
  const META = await META_SCRAPER({ html: HTML, url: FINAL_URL });

  /** Khai báo cờ hình ảnh gọi tính logic nếu quét được có ảnh trong object thì tiếp tục dùng tham số đó làm giàu chi tiết */
  const IMAGE = META.image ? await enrichImage(META.image) : null;

  /** Khai báo biến đại diện Logo bằng hàm phân tích dò tìm favicon nội dung qua html lấy về được */
  const LOGO = await detectFavicon(HTML, FINAL_URL);

  // Hiển thị nội dung vừa cào trích xuất từ metascraper thông qua lệnh info logs ra stdout console
  console.log("meta::", META);

  // Tổng hợp lại tất cả kết quả lấy được đưa thành object metadata trả lại cho phần core yêu cầu
  return {
    lang: META.lang || "en",
    author: META.author,
    title: META.title,
    publisher: new URL(FINAL_URL).hostname,
    image: IMAGE,
    date: META.date || RESPONSE.headers["last-modified"] || null,
    description: META.description,
    url: FINAL_URL,
    audio: META.audio,
    logo: LOGO,
    iframe: META.iframe,
    video: META.video,
  };
}

// ------------------------
// API
// ------------------------

// Khai báo định nghĩa route /metadata bằng method GET truy cập vào lấy kết quả qua ExpressJS
APP.get("/metadata", async (req, res) => {
  // Tiếp tục mở khối mã try catch block bọc xung quanh chạy lấy data API để xử lý error an toàn
  try {
    /** Khai báo giải mã tham số url trích xuất ra từ trong query string từ request mà phiá client gửi đi */
    const { url: URL_PARAM } = req.query;

    // Xem URL xem có được cung cấp trong request không nếu thiếu thả thẳng HTTP code 400 cùng báo lỗi chuỗi JSON
    if (!URL_PARAM)
      return res.status(400).json({ error: "Missing url parameter" });

    /** Khai báo và gọi chạy tiến trình cào nội dung scrape đối với giá trị tham số đó rồi giữ hứng trong biến */
    const DATA = await scrape(URL_PARAM);

    // Truyền tải và phản hồi chuỗi json được đóng gói trả về từ đối tượng qua luồng response
    res.json(DATA);
  } catch (err) {
    // Bắt lỗi không xác định từ máy hoặc hàm và thiết lập cho trả ra thông báo http lỗi trạng thái 500
    res.status(500).json({ error: err.message });
  }
});

// Khởi chạy kích hoạt tạo nghe máy chủ mở cổng socket để hứng các connection liên kết HTTP request
APP.listen(PORT, () => {
  // Báo ra màn command line terminal trạng thái app đang được chạy và chờ kết nối thành công tại host
  console.log(`Metadata API running at http://localhost:${PORT}`);
});
