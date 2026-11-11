function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <span className="status">● online</span>
        <span className="sep">|</span>
        <span>stealthdebug.org</span>
        <span className="sep">|</span>
        <span>reverse · crack · disasm</span>
        <span className="right">
          <a href="https://github.com/mariogarcia79/stealthdebug" target="_blank" rel="noopener noreferrer">source</a>
          <span>© {new Date().getFullYear()}</span>
        </span>
      </div>
    </footer>
  );
}

export default Footer;
