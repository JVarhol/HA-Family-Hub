import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import Heading from '@theme/Heading';
import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <p className={styles.heroBlurb}>
          An 11-card dashboard ecosystem for Home Assistant &mdash; calendar,
          meal planning, chores, rewards, goals, and routines &mdash; built to
          compete with commercial family-hub tablets while running entirely
          on infrastructure you already own.
        </p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/intro">
            Read the Docs
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            to="/docs/installation"
            style={{marginLeft: '1rem'}}>
            Installation
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="A Home Assistant custom integration bundling a family-tablet dashboard: calendar, meal planning, chores, rewards, goals, routines, and more.">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
