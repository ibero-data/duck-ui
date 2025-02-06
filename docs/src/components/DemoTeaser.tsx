import React, { useEffect } from "react";
import Link from "@docusaurus/Link";
import { Terminal } from "lucide-react";
import DotPattern from "./ui/dotpattern";
import Logo from "@site/static/img/logo-padding.png";


const FloatingLogos = () => {
  return (
    <div className="logos-container" aria-hidden="true">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="floating-logo"
          style={{
            left: `${Math.random() * 90}%`,
            animationDelay: `${Math.random() * 8}s`,
            animationDuration: `${15 + Math.random() * 15}s`,
            opacity: 0.1 + Math.random() * 0.2,
          }}
        >
          <img src={Logo} alt="" className="logo-image" />
        </div>
      ))}
    </div>
  );
};

interface DemoTeaserProps {
  className?: string;
}

const DemoTeaser: React.FC<DemoTeaserProps> = ({ className }) => {
  const [isLoading, setIsLoading] = React.useState(false);
  const [showTable, setShowTable] = React.useState(false);
  const demoUrl =
    "https://demo.duckui.com?utm_source=website&utm_medium=demo_teaser";
  const comment = `-- Load a sample dataset`;
  const sqlQuery = `SELECT * FROM 'https://shell.duckdb.org/data/tpch/0_01/parquet/orders.parquet' LIMIT 1000;`;

  useEffect(() => {
    let loadingTimeoutId: NodeJS.Timeout;
    let tableTimeoutId: NodeJS.Timeout;

    loadingTimeoutId = setTimeout(() => {
      setIsLoading(true);
      tableTimeoutId = setTimeout(() => {
        setIsLoading(false);
        setShowTable(true);
      }, 3000);
    }, 5000);

    return () => {
      clearTimeout(loadingTimeoutId);
      clearTimeout(tableTimeoutId);
    };
  }, []);

  const queryResult = [
    {
      o_orderkey: 1,
      o_orderstatus: "O",
      o_totalprice: 172799.49,
      o_orderpriority: "5-LOW",
    },
    {
      o_orderkey: 2,
      o_orderstatus: "O",
      o_totalprice: 38426.09,
      o_orderpriority: "1-URGENT",
    },
    {
      o_orderkey: 3,
      o_orderstatus: "F",
      o_totalprice: 205654.3,
      o_orderpriority: "5-LOW",
    },
    {
      o_orderkey: 4,
      o_orderstatus: "O",
      o_totalprice: 56000.91,
      o_orderpriority: "5-LOW",
    },
    {
      o_orderkey: 5,
      o_orderstatus: "F",
      o_totalprice: 105367.67,
      o_orderpriority: "5-LOW",
    },
  ];

  return (
    <>
      <DotPattern />

      <section className="demo-teaser">
        <FloatingLogos />

        <div className="hero-container">
          <div className="hero-content">
            <h2 className="hero-title">Try Duck-UI in action!</h2>
            <p className="hero-description">
              Experience the power of DuckDB WASM right in your browser. Our
              interactive demo lets you write SQL queries, analyze data, and get
              insights instantly - no installation required.
            </p>

            <div className="features-preview">
              <div className="feature-item">
                <Terminal className="w-5 h-5 text-yellow-400" />
                <span>Write SQL queries</span>
              </div>
              <div className="feature-item">
                <Terminal className="w-5 h-5 text-yellow-400" />
                <span>Analyze data instantly</span>
              </div>
              <div className="feature-item">
                <Terminal className="w-5 h-5 text-yellow-400" />
                <span>Only simple insights</span>
              </div>
            </div>

            <div className="hero-buttons">
              <Link
                href={demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hero-button"
              >
                Try it now
              </Link>
            </div>
          </div>

          <div className="hero-image-container">
            <div className="demo-preview">
              <div className="terminal-header">
                <div className="terminal-dots">
                  <span className="dot dot-red"></span>
                  <span className="dot dot-yellow"></span>
                  <span className="dot dot-green"></span>
                </div>
                <div className="terminal-title">Duck-UI Demo</div>
              </div>
              <div className="terminal-content">
                {!isLoading && !showTable && (
                  <>
                    <TypingEffect text={comment} />
                    <br />
                    <TypingEffect text={sqlQuery} />
                  </>
                )}
                {isLoading && <TypingEffect text="Running query..." />}

                {showTable && (
                  <table>
                    <thead>
                      <tr>
                        {Object.keys(queryResult[0]).map((key) => (
                          <th key={key}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.map((row, index) => (
                        <tr key={index}>
                          {Object.values(row).map((value, index) => (
                            <td key={index}>{value}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>

        <style>{`
          .demo-teaser {
            position: relative;
            width: 100%;
            min-height: calc(100vh - 4rem);
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow: hidden;
            padding: clamp(3rem, 5vh, 6rem) 0;
            border-bottom: 1px solid rgba(255, 232, 20, 0.1);
            background: linear-gradient(180deg,rgb(20, 20, 20) 0%,rgb(30, 30, 30) 100%);
          }

          .logos-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
            overflow: hidden;
          }

          .floating-logo {
            position: absolute;
            width: 64px;
            height: 64px;
            animation: floatLogo linear infinite;
            filter: drop-shadow(0 0 10px rgba(255, 232, 20, 0.2));
          }

          .logo-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
            animation: rotateLogo linear infinite;
            animation-duration: inherit;
          }

          @keyframes floatLogo {
            0% {
              transform: translateY(100vh) scale(0.8);
              filter: brightness(0.5) drop-shadow(0 0 5px rgba(255, 232, 20, 0.1));
            }
            20% {
              transform: translateY(80vh) scale(0.9);
              filter: brightness(0.7) drop-shadow(0 0 10px rgba(255, 232, 20, 0.2));
            }
            80% {
              transform: translateY(20vh) scale(1.1);
              filter: brightness(0.7) drop-shadow(0 0 15px rgba(255, 232, 20, 0.2));
            }
            100% {
              transform: translateY(-100px) scale(1);
              filter: brightness(0.5) drop-shadow(0 0 5px rgba(255, 232, 20, 0.1));
            }
          }

          @keyframes rotateLogo {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          .hero-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4rem;
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 1.5rem;
            position: relative;
            z-index: 2;
          }

          .hero-content {
            display: flex;
            flex-direction: column;
            justify-content: center;
          }

          .hero-title {
            font-size: 3rem;
            font-weight: bold;
            margin-bottom: 1.5rem;
            background: linear-gradient(to right, #FFE814, #FFB800);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

          .hero-description {
            font-size: 1.2rem;
            line-height: 1.6;
            color: #b4b4b4;
            margin-bottom: 2rem;
          }

          .features-preview {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            margin: 2rem 0;
          }

          .feature-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            color: var(--ifm-color-primary-light);
            font-size: 1.1rem;
          }

          .hero-buttons {
            display: flex;
            gap: 1rem;
            margin-top: 2rem;
          }

          .hero-button {
            display: inline-flex;
            align-items: center;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            font-weight: 500;
            transition: all 0.2s;
            background: #FFE814;
            color: #000;
            text-decoration: none;
          }

          .hero-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(255, 232, 20, 0.3);
            text-decoration: none;
          }

          .demo-preview {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 0.75rem;
            border: 1px solid rgba(255, 232, 20, 0.2);
            overflow: hidden;
            width: 100%;
            max-width: 600px;
            box-shadow: 0 4px 24px rgba(255, 232, 20, 0.1);
          }

          .terminal-header {
            background: rgba(0, 0, 0, 0.4);
            padding: 0.75rem 1rem;
            display: flex;
            align-items: center;
            border-bottom: 1px solid rgba(255, 232, 20, 0.1);
          }

          .terminal-dots {
            display: flex;
            gap: 0.5rem;
          }

          .dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            opacity: 0.7;
          }

          .dot-red { background: #ff5f56; }
          .dot-yellow { background: #ffbd2e; }
          .dot-green { background: #27c93f; }

          .terminal-title {
            flex: 1;
            text-align: center;
            color: #666;
            font-size: 0.9rem;
          }

          .terminal-content {
            padding: 1.5rem;
            font-family: monospace;
            color: #b4b4b4;
            min-height: 200px;
          }

          .typing-effect {
            white-space: pre-wrap;
            border-right: 2px solid var(--ifm-color-primary);
            animation: typing 3s steps(40) infinite;
          }

          @keyframes typing {
            from { width: 0; }
            to { width: 100%; }
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th, td {
            border: 1px solid #444;
            padding: 0.5rem;
            text-align: left;
          }

          th {
            background-color: #222;
            font-weight: bold;
          }

          @media (max-width: 768px) {
            .hero-container {
              grid-template-columns: 1fr;
              gap: 2rem;
            }

            .demo-preview {
              max-width: 100%;
            }

            .hero-title {
              font-size: 2.5rem;
            }
          }
        `}</style>
      </section>
    </>
  );
};

interface TypingEffectProps {
  text: string;
}

const TypingEffect: React.FC<TypingEffectProps> = ({ text }) => {
  const [displayedText, setDisplayedText] = React.useState("");
  const [charIndex, setCharIndex] = React.useState(0);
  const [isTyping, setIsTyping] = React.useState(true);

  React.useEffect(() => {
    if (charIndex < text.length && isTyping) {
      const timeoutId = setTimeout(() => {
        setDisplayedText((prev) => prev + text[charIndex]);
        setCharIndex((prev) => prev + 1);
      }, 30);

      return () => clearTimeout(timeoutId);
    } else {
      setIsTyping(false);
    }
  }, [charIndex, text, isTyping]);

  return (
    <span>
      {displayedText}
      {isTyping && <span className="typing-cursor">|</span>}
      <style>{`
        .typing-cursor {
          color: #ffda63;
          animation: blink-caret 0.75s step-end infinite;
        }

        @keyframes blink-caret {
          from, to {
            color: transparent;
          }
          50% {
            color: #ffda63;
          }
        }
      `}</style>
    </span>
  );
};

export default DemoTeaser;
