import Link from "next/link";

export function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <p className="app-footer-copy">© {new Date().getFullYear()} AURA Board</p>
        <nav className="app-footer-links">
          <Link href="/privacy">개인정보처리방침</Link>
          <Link href="/terms">이용약관</Link>
          <a href="mailto:mallagaenge@gmail.com">문의하기</a>
        </nav>
      </div>
    </footer>
  );
}
