import React, { useEffect } from "react";
import Link from "@docusaurus/Link";
import { Terminal, ArrowRight } from "lucide-react";
import clsx from "clsx";
import DotPattern from "./ui/dotpattern";

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
      }, 3000); // Show "Loading..." for 3 seconds
    }, 5000); // Initial delay of 3 seconds

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

      <section className={clsx("hero-section", className)}>
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
                Try Demo
                <ArrowRight className="ml-2 w-5 h-5" />
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

      .dot-red {
        background: #ff5f56;
      }
      .dot-yellow {
        background: #ffbd2e;
      }
      .dot-green {
        background: #27c93f;
      }

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
        from {
          width: 0;
        }
        to {
          width: 100%;
        }
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
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
          from,
          to {
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
