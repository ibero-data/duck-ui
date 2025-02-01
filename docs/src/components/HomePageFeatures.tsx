import React from "react";
import {
  DatabaseZap,
  SquareTerminal,
  Table2,
  ChartArea,
  Activity,
  CommandIcon,
  DownloadCloud,
  LaptopMinimalCheck,
} from "lucide-react";

type FeatureItem = {
  title: string;
  Icon: React.ElementType;
  description: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Data Explorer",
    Icon: DatabaseZap,
    description:
      "Browse your databases, tables and files effortlessly with our intuitive data explorer.",
  },
  {
    title: "SQL Editor",
    Icon: SquareTerminal,
    description:
      "Write and run queries with our powerful SQL editor. Enjoy syntax highlighting and auto-completion.",
  },
  {
    title: "Data Visualization",
    Icon: Table2,
    description:
      "View your data in interactive tables. Easily filter, sort, and export your data.",
  },
  {
    title: "Data Export",
    Icon: DownloadCloud,
    description:
      "Export your data in JSON/CSV/PARQUET. Download your query results with a single click.",
  },
  {
    title: "Data Insights",
    Icon: ChartArea,
    description:
      "Gain valuable insights from your data with ease. Uncover patterns and trends quickly.",
  },
  {
    title: "Fast and Efficient",
    Icon: Activity,
    description:
      "Simply twick your queries to get the metrics you need. DuckDB is fast and efficient.",
  },
  {
    title: "Simple and Intuitive",
    Icon: CommandIcon,
    description:
      "Duck-UI is designed to be user-friendly and easy to navigate for beginners and experts alike.",
  },
  {
    title: "Easy to deploy",
    Icon: LaptopMinimalCheck,
    description:
      "With only 1 command spin the image and start querying your data.",
  },
];

function FeatureCard({ title, Icon, description }: FeatureItem) {
  return (
    <div className="feature-card">
      <div className="feature-card-content">
        <Icon className="feature-card-icon" />
        <h3 className="feature-card-title">{title}</h3>
        <p className="feature-card-description">{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <>
      <style>
        {`
          .features-section {
            width: 100%;
            max-width: 1400px;
            margin: 0 auto;
            padding: 4rem 1rem;
          }

          .features-header {
            text-align: center;
            margin-bottom: 4rem;
          }

          .gradient-text {
            font-size: clamp(2.5rem, 5vw, 4.5rem);
            font-weight: 800;
            letter-spacing: -0.025em;
            background: linear-gradient(135deg, #ffe300 0%, #ff652f 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            margin: 0;
            line-height: 1.2;
          }

          .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 2rem;
            padding: 1rem;
          }

          .feature-card {
            position: relative;
            background: rgba(255, 255, 255, 0.02);
            border: 2px solid #ffe300;
            border-radius: 16px;
            padding: 2rem;
            transition: all 0.3s ease;
            cursor: pointer;
            overflow: hidden;
          }

          .feature-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, rgba(255, 227, 0, 0.1) 0%, rgba(255, 101, 47, 0.1) 100%);
            opacity: 0;
            transition: opacity 0.3s ease;
          }

          .feature-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 24px rgba(255, 227, 0, 0.15);
          }

          .feature-card:hover::before {
            opacity: 1;
          }

          .feature-card-content {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            z-index: 1;
          }

          .feature-card-icon {
            width: 48px;
            height: 48px;
            color: #ffe300;
            margin-bottom: 1.5rem;
            transition: transform 0.3s ease;
          }

          .feature-card:hover .feature-card-icon {
            transform: scale(1.1);
          }

          .feature-card-title {
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0 0 1rem 0;
            color: inherit;
          }

          .feature-card-description {
            font-size: 0.95rem;
            line-height: 1.6;
            margin: 0;
          }

          @media (max-width: 768px) {
            .features-section {
              padding: 3rem 1rem;
            }

            .features-grid {
              gap: 1.5rem;
            }

            .feature-card {
              padding: 1.5rem;
            }
          }

          @media (max-width: 480px) {
            .gradient-text {
              font-size: 2rem;
            }

            .feature-card-icon {
              width: 40px;
              height: 40px;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .feature-card,
            .feature-card-icon {
              transition: none;
            }
          }
        `}
      </style>
      <section className="features-section">
        <div className="features-header">
          <h2 className="gradient-text">Duck-UI Features</h2>
        </div>
        <div className="features-grid">
          {FeatureList.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </section>
    </>
  );
}
