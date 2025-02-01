const SponsorsList = [
  {
    name: "Ibero Data",
    logo: "https://www.iberodata.es/logo.png",
    url: "https://www.iberodata.es/?utm_source=ch-ui&utm_medium=sponsorship",
  },
];

export const Sponsors = () => {
  return (
    <>
      <style>
        {`
          .sponsors-section {
            padding: clamp(3rem, 8vh, 6rem) 0;
            min-height: 60vh;
            position: relative;
            overflow: hidden;
          }

          .sponsors-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, 
              transparent 0%, 
              rgba(255, 232, 20, 0.3) 50%,
              transparent 100%
            );
          }

          .sponsors-container {
            width: min(100% - 2rem, 1200px);
            margin-inline: auto;
            display: flex;
            flex-direction: column;
            gap: clamp(3rem, 6vh, 5rem);
          }

          .sponsors-header {
            text-align: center;
            opacity: 0;
            animation: fadeInUp 0.6s ease-out forwards;
          }

          .sponsors-title {
            font-size: clamp(2.5rem, 5vw, 4rem);
            font-weight: 800;
            line-height: 1.2;
            margin: 0 0 1rem;
            background: linear-gradient(135deg, #ffe814 0%, #ff6600 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            position: relative;
            display: inline-block;
          }

          .sponsors-title::after {
            content: '';
            position: absolute;
            bottom: -0.5rem;
            left: 25%;
            width: 50%;
            height: 3px;
            background: linear-gradient(135deg, #ffe814 0%, #ff6600 100%);
            transform: scaleX(0);
            transform-origin: left;
            animation: lineGrow 0.6s ease-out 0.4s forwards;
          }

          .sponsors-subtitle {
            font-size: clamp(1rem, 2vw, 1.25rem);
            color: #9ca3af;
            max-width: 600px;
            margin: 1rem auto 0;
          }

          .sponsors-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
            padding: 1rem;
            opacity: 0;
            animation: fadeIn 0.6s ease-out 0.4s forwards;
          }

          .sponsor-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 2rem;
            border-radius: 1rem;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 232, 20, 0.1);
            transition: transform 0.3s ease, background-color 0.3s ease;
            position: relative;
            overflow: hidden;
            text-decoration: none;
            max-width: 270px;
            min-width: 270px;
            margin-inline: auto;
          }

          .sponsor-card::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, 
              rgba(255, 232, 20, 0.1) 0%,
              rgba(255, 102, 0, 0.1) 100%
            );
            opacity: 0;
            transition: opacity 0.3s ease;
          }

          .sponsor-card:hover {
            transform: translateY(-5px);
          }

          .sponsor-card:hover::before {
            opacity: 1;
          }

          .sponsor-logo {
            width: 8rem;
            height: 8rem;
            object-fit: contain;
            margin: 1rem 0;
            transition: transform 0.3s ease;
          }

          .sponsor-card:hover .sponsor-logo {
            transform: scale(1.05);
          }

          .sponsor-name {
            font-size: 1.25rem;
            font-weight: 600;
            color: #fff;
            margin: 1rem 0 0;
            position: relative;
          }

          .become-sponsor {
            text-align: center;
            margin-top: 3rem;
            opacity: 0;
            animation: fadeIn 0.6s ease-out 0.6s forwards;
          }

          .become-sponsor-link {
            display: inline-block;
            padding: 1rem 2rem;
            font-size: 1.125rem;
            font-weight: 600;
            color: #ffe814;
            text-decoration: none;
            border: 2px solid #ffe814;
            border-radius: 0.5rem;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
          }

          .become-sponsor-link::before {
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

          .become-sponsor-link:hover {
            color: #000;
          }

          .become-sponsor-link:hover::before {
            transform: scaleX(1);
            transform-origin: left;
          }

          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
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

          @media (prefers-reduced-motion: reduce) {
            .sponsors-header,
            .sponsors-grid,
            .become-sponsor,
            .sponsor-card,
            .sponsor-logo {
              animation: none;
              transition: none;
            }

            .sponsors-title::after,
            .become-sponsor-link::before {
              animation: none;
              transition: none;
            }
          }
        `}
      </style>

      <section id="sponsors" className="sponsors-section">
        <div className="sponsors-container">
          <header className="sponsors-header">
            <h2 className="sponsors-title">Sponsors</h2>
            <p className="sponsors-subtitle">
              We would like to thank our sponsors for their support.
            </p>
          </header>

          <div className="sponsors-grid">
            {SponsorsList.map((sponsor, index) => (
              <a
                key={index}
                href={sponsor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="sponsor-card"
              >
                <img
                  src={sponsor.logo}
                  alt={sponsor.name}
                  className="sponsor-logo"
                  loading="lazy"
                />
                <span className="sponsor-name">{sponsor.name}</span>
              </a>
            ))}
          </div>

          <div className="become-sponsor">
            <a
              href="mailto:caio.ricciuti+sponsorship@outlook.com?subject=Sponsorship%20Inquiry"
              target="_blank"
              rel="noopener noreferrer"
              className="become-sponsor-link"
            >
              Become a sponsor
            </a>
          </div>
        </div>
      </section>
    </>
  );
};

export default Sponsors;
