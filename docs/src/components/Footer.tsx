//Footer Component

import { Github } from "lucide-react";
import Link from "@docusaurus/Link";

export default function Footer() {
  return (
    <>
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-grid">
            <div className="footer-brand">
              <p className="footer-tagline">Data is better when we see it!</p>
              <div className="social-links">
                <Link
                  href="https://github.com/caioricciuti/duck-ui"
                  className="github-link"
                  aria-label="GitHub Repository"
                >
                  <Github size={24} />
                </Link>
              </div>
            </div>

            <div className="footer-section">
              <h4 className="footer-heading">Documentation</h4>
              <div className="footer-links">
                <Link href="/docs/getting-started" className="footer-link">
                  Get Started
                </Link>
                <Link href="/docs/license" className="footer-link">
                  License
                </Link>
              </div>
            </div>

            <div className="footer-section">
              <h4 className="footer-heading">Community</h4>
              <div className="footer-links">
                <Link
                  href="https://github.com/caioricciuti/duck-ui/discussions"
                  className="footer-link"
                >
                  Discussions
                </Link>
                <Link href="/docs/contributing" className="footer-link">
                  Contributing
                </Link>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <p className="copyright">
              © {new Date().getFullYear()} Duck-ui. All rights reserved.
            </p>
            <div className="legal-links">
              <Link href="/docs/legal/privacy-policy" className="legal-link">
                Privacy Policy
              </Link>
              <Link href="/docs/legal/terms-of-service" className="legal-link">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
