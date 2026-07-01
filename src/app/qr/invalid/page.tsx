/**
 * /qr/invalid — QR 토큰을 찾을 수 없을 때의 안내.
 *
 * 기존에 /qr/[token]/page.tsx 가 처리하던 "unknown token" 브랜치를
 * Route Handler 로 이동하면서 분리된 정적 페이지.
 */
export const metadata = { title: "QR 코드 오류 · Aura-board" };

export default function QRInvalidPage() {
  return (
    <div className="student-qr-landing">
      <div className="student-qr-error">
        <h2>QR 코드를 인식할 수 없어요</h2>
        <p>
          유효하지 않거나 만료된 QR 코드예요. 선생님께 새 QR 코드를
          요청하거나 텍스트 코드로 로그인하세요.
        </p>
        <a href="/login" className="student-login-btn">
          코드로 로그인
        </a>
      </div>
    </div>
  );
}
