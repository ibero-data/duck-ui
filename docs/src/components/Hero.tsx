import { type FC } from "react";
import Link from "@docusaurus/Link";
import { ArrowBigDown } from "lucide-react";
import clsx from "clsx";
import DotPattern from "./ui/dotpattern";
import Logo from "@site/static/img/logo.png";

interface HeroSectionProps {
  className?: string;
}

export const HeroSection: FC<HeroSectionProps> = ({ className }) => {
  const scrollToContent = () => {
    window.scrollTo({
      top: window.innerHeight - 10,
      behavior: "smooth",
    });
  };

  return (
    <>
      <style>
        {`
          .hero-section {
            position: relative;
            width: 100%;
            min-height: calc(100vh - 4rem);
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow: hidden;
            padding: clamp(3rem, 5vh, 6rem) 0;
          }

          .hero-container {
            width: min(100% - 2rem, 1536px);
            margin-inline: auto;
            display: grid;
            gap: clamp(2rem, 4vw, 4rem);
            align-items: center;
            padding: 0 1rem;
          }

          @media (min-width: 1024px) {
            .hero-container {
              grid-template-columns: 1fr 1fr;
              padding: 0 2rem;
            }
          }

          .hero-content {
            display: flex;
            flex-direction: column;
            gap: clamp(1.5rem, 3vw, 2.5rem);
            animation: slideUp 0.8s ease-out forwards;
          }

          .hero-title {
            font-size: clamp(2.25rem, 5vw, 4rem);
            font-weight: 800;
            line-height: 1.0;
            margin: 0;
            background: linear-gradient(135deg, #ffe814 0%, #ff6600 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            position: relative;
          }

          .hero-title::after {
            content: '';
            position: absolute;
            bottom: -0.5rem;
            left: 0;
            width: 40%;
            height: 3px;
            background: linear-gradient(135deg, #ffe814 0%, #ff6600 100%);
            transform: scaleX(0);
            transform-origin: left;
            animation: lineGrow 0.6s ease-out 0.8s forwards;
          }

          .hero-description {
            font-size: clamp(1.125rem, 2vw, 1.5rem);
            line-height: 1.6;
            max-width: 600px;
            color: var(--text-color, inherit);
            opacity: 0;
            animation: fadeIn 0.6s ease-out 0.4s forwards;
          }

          .hero-description a {
            color: #ffe814;
            text-decoration: none;
            position: relative;
            transition: color 0.3s ease;
          }

          .hero-description a::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 100%;
            height: 2px;
            background: currentColor;
            transform: scaleX(0);
            transform-origin: right;
            transition: transform 0.3s ease;
          }

          .hero-description a:hover::after {
            transform: scaleX(1);
            transform-origin: left;
          }

          .hero-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 1.5rem;
            opacity: 0;
            animation: fadeIn 0.6s ease-out 0.6s forwards;
          }

          .hero-button {
            font-size: clamp(1.25rem, 2vw, 1.5rem);
            font-weight: 700;
            padding: 0.75rem 1.5rem;
            border-radius: 0.75rem;
            border: 2px solid #ffe814;
            background: transparent;
            color: #ffe814;
            text-decoration: none;
            position: relative;
            overflow: hidden;
            transition: color 0.3s ease;
            z-index: 1;
          }

          .hero-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #ffe814;
            transform: scaleX(0);
            transform-origin: right;
            transition: transform 0.3s ease;
            z-index: -1;
          }

          .hero-button:hover {
            color: #000;
          }

          .hero-button:hover::before {
            transform: scaleX(1);
            transform-origin: left;
          }

          .github-stars {
            transform: translateY(0);
            transition: transform 0.3s ease;

            margin: auto 0;
            width: 220px;
          }
          
          .github-stars img {
            width: 100%;
            height: auto;
          } 

          .github-stars:hover {
            transform: translateY(-3px);

          }

          .hero-image-container {
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            animation: fadeIn 0.8s ease-out 0.8s forwards;
          }

          .hero-image-wrapper {
            position: relative;
            width: 100%;
            max-width: 500px;
            aspect-ratio: 1;
          }

          .hero-image-wrapper::after {
            content: '';
            position: absolute;
            inset: -10px;
            border-radius: 50%;
            background: linear-gradient(135deg, #ffe81420 0%, #ff660020 100%);
            filter: blur(40px);
            z-index: -1;
          }

          .hero-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
            transform: translateY(0);
            animation: float 6s ease-in-out infinite;
          }

          .scroll-button {
            position: absolute;
            bottom: 2rem;
            left: 50%;
            transform: translateX(-50%);
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 1rem;
            opacity: 0;
            animation: fadeIn 0.6s ease-out 1s forwards;
          }

          .scroll-arrow {
            color: #ffe814;
            animation: bounce 2s ease-in-out infinite;
          }

          @keyframes slideUp {
            from {
              transform: translateY(30px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes lineGrow {
            from {
              transform: scaleX(0);
            }
            to {
              transform: scaleX(1);
            }
          }

          @keyframes float {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-20px);
            }
          }

          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {
              transform: translateY(0);
            }
            40% {
              transform: translateY(-10px);
            }
            60% {
              transform: translateY(-5px);
            }
          }

          .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border-width: 0;
          }

          @media (prefers-reduced-motion: reduce) {
            .hero-title::after,
            .hero-description,
            .hero-buttons,
            .hero-image-container,
            .scroll-button,
            .hero-image,
            .scroll-arrow {
              animation: none;
            }

            .hero-button::before {
              transition: none;
            }
          }
        `}
      </style>
      <DotPattern />

      <section className={clsx("hero-section", className)}>
        <div className="hero-container">
          <div className="hero-content">
            <h1 className="sr-only">Duck-UI</h1>
            <p className="hero-title">Data is better when we see it!</p>
            <p className="hero-description">
              Duck-UI is your gateway to use{" "}
              <a
                href="https://duckdb.org/docs/api/wasm/overview.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                DuckDB
              </a>{" "}
              WASM on your browser. It's a simple and easy-to-use tool to
              analyze and visualize your data with using SQL queries.
            </p>

            <div className="hero-buttons">
              <Link href="/docs/intro" className="hero-button">
                Get Started 🚀
              </Link>

              <Link
                href="https://github.com/caioricciuti/duck-ui"
                target="_blank"
                rel="noopener noreferrer"
                className="github-stars"
              >
                <img
                  src="https://img.shields.io/github/stars/caioricciuti/duck-ui?style=social"
                  alt="GitHub Stars"
                  loading="lazy"
                />
              </Link>
            </div>
          </div>

          <div className="hero-image-container">
            <div className="hero-image-wrapper">
              <img
                src={Logo}
                alt="Duck-UI Logo"
                className="hero-image"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        <button
          onClick={scrollToContent}
          className="scroll-button"
          aria-label="Scroll to content"
        >
          <ArrowBigDown className="scroll-arrow" size={58} />
        </button>
      </section>
    </>
  );
};

export default HeroSection;
