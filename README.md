# VN-580 Plus Online — Máy tính khoa học cho học sinh

Web app máy tính khoa học chạy trực tiếp trên trình duyệt (không cần cài đặt, hoạt động cả khi mở offline qua `index.html`), được thiết kế theo thói quen bấm phím của học sinh Việt Nam.

## Tính năng chính
- **Tính toán khoa học (`1:COMP`)**: Phân số, đổi `S⇔D` (phân số / căn thức / bội của $\pi$ ↔ thập phân, hỗn số `a b/c`), tổ hợp `nCr`, chỉnh hợp `nPr`, `GCD`, `LCM`, phân tích thừa số nguyên tố (`FACT`), tích phân `∫dx`, đạo hàm `d/dx`, tổng `Σ`, tích `Π`, `CALC` và `SOLVE` (tìm nghiệm gần đúng).
- **Đầy đủ chế độ (`MENU`)**:
  - `2:CMPLX` — Số phức (`a + bi`, `r∠θ`, `Arg`, `Conjg`, `Abs`).
  - `3:BASE-N` — Chuyển đổi `DEC / HEX / BIN / OCT` và phép toán bit (`AND`, `OR`, `XOR`, `NOT`).
  - `4:MATRIX` — Cộng, trừ, nhân, định thức `Det`, nghịch đảo `A⁻¹`, chuyển vị `Trn`.
  - `5:VECTOR` — Cộng, tích vô hướng, tích có hướng, độ dài, góc giữa 2 vector.
  - `6:STAT` — Thống kê 1 biến và hồi quy tuyến tính 2 biến (`y = a + bx`, `r`).
  - `8:TABLE` — Tạo bảng giá trị `f(x)`, `g(x)`.
  - `9:EQUATION` — Giải hệ PT 2–4 ẩn; giải PT bậc 2, 3, 4 (gồm nghiệm phức & cực trị).
  - `A:INEQ` — Giải bất phương trình bậc 2, bậc 3.
- **Tiện ích mở rộng**: Hằng số khoa học (`SHIFT` + `7` `CONST`), đổi đơn vị (`SHIFT` + `8` `CONV`), lưu biến `A–F, x, y, M`, lịch sử tính toán tự động lưu.
- **5 Giao diện (Skin)**: Classic 580, Hacker, Mèo Hồng, Anime Neon, Cozy Study.

## Chạy cục bộ
Mở trực tiếp tệp `index.html` bằng trình duyệt bất kỳ, hoặc chạy static server:
```bash
npx serve .
```

## Giấy phép & Miễn trừ
- Mã nguồn phát hành theo giấy phép **MIT** (xem tệp `LICENSE`).
- Công cụ học tập độc lập tương thích thao tác máy tính 580VN, không sử dụng ROM/firmware gốc và không phải sản phẩm chính thức của Casio.
