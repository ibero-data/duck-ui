import { Github } from "lucide-react";
import Link from "@docusaurus/Link";

export default function Footer() {
  return (
    <>
      <style>
        {`
          .footer {
            background-color: #111;
            padding: clamp(3rem, 5vh, 5rem) 1rem;
            position: relative;
            overflow: hidden;
          }

          .footer::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, 
              transparent 0%, 
              rgba(255, 232, 20, 0.2) 50%,
              transparent 100%
            );
          }

          .footer-container {
            width: min(100%, 1200px);
            margin-inline: auto;
            display: flex;
            flex-direction: column;
            gap: 3rem;
          }

          .footer-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 3rem;
          }

          .footer-brand {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }

          .footer-tagline {
            font-size: 1.25rem;
            color: #666;
            max-width: 250px;
            line-height: 1.5;
          }

          .social-links {
            display: flex;
            gap: 1rem;
            margin-top: 0.5rem;
          }

          .github-link {
            color: #666;
            transition: all 0.3s ease;
            display: inline-flex;
            padding: 0.5rem;
            border-radius: 0.5rem;
            background: rgba(255, 255, 255, 0.05);
          }

          .github-link:hover {
            color: #ffe814;
            background: rgba(255, 232, 20, 0.1);
            transform: translateY(-2px);
          }

          .footer-section {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }

          .footer-heading {
            font-size: 1rem;
            font-weight: 600;
            color: #fff;
            position: relative;
            padding-bottom: 0.5rem;
          }

          .footer-heading::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            width: 2rem;
            height: 2px;
            background: linear-gradient(90deg, #ffe814, transparent);
          }

          .footer-links {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .footer-link {
            color: #666;
            text-decoration: none;
            transition: all 0.3s ease;
            position: relative;
            width: fit-content;
          }

          .footer-link::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 100%;
            height: 1px;
            background: #ffe814;
            transform: scaleX(0);
            transform-origin: right;
            transition: transform 0.3s ease;
          }

          .footer-link:hover {
            color: #ffe814;
          }

          .footer-link:hover::after {
            transform: scaleX(1);
            transform-origin: left;
          }

          .footer-bottom {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 1rem;
            padding-top: 2rem;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }

          .copyright {
            color: #666;
            font-size: 0.875rem;
          }

          .legal-links {
            display: flex;
            gap: 1.5rem;
          }

          .legal-link {
            color: #666;
            font-size: 0.875rem;
            text-decoration: none;
            transition: color 0.3s ease;
          }

          .legal-link:hover {
            color: #ffe814;
          }

          @media (max-width: 768px) {
            .footer-bottom {
              flex-direction: column;
              align-items: center;
              text-align: center;
              gap: 1.5rem;
            }

            .footer-brand {
              align-items: center;
              text-align: center;
            }

            .footer-section {
              align-items: center;
              text-align: center;
            }

            .footer-heading::after {
              left: 50%;
              transform: translateX(-50%);
            }

            .footer-link {
              text-align: center;
              margin: 0 auto;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .github-link,
            .footer-link,
            .legal-link {
              transition: none;
            }

            .footer-link::after {
              transition: none;
            }
          }
        `}
      </style>

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
