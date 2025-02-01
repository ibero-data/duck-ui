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
      description="Description will go into a meta tag in <head />"
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
