import type { ReactNode } from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import HeroSection from "../components/Hero";
import Sponsors from "../components/Sponsors";
import HomepageFeatures from "../components/HomePageFeatures";
import Footer from "../components/Footer";

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Duck-UI - Get start using your data with Duck-UI on your browser. Duck-UI is a data visualization tool that allows you to slice and dice your data on the go."
    >
      <main>
        <HeroSection />
        <HomepageFeatures />
        <Sponsors />
        <Footer />
      </main>
    </Layout>
  );
}
