import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <img
          src={useBaseUrl('/img/logo.png')}
          alt="Family Hub logo"
          width="96"
          height="96"
          className={styles.heroLogo}
        />
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <p className={styles.heroBlurb}>
          A 12-card dashboard ecosystem for Home Assistant &mdash; calendar,
          meal planning, chores, rewards, goals, routines, and a live
          who&rsquo;s-home view, in 10 themes and 8 languages &mdash; built to
          compete with commercial family-hub tablets while running entirely
          on infrastructure you already own.
        </p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/intro">
            Read the Docs
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            to="/docs/installation">
            Installation
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            to="/docs/card-configuration">
            The cards
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            href="https://discord.com/channels/330944238910963714/1543630448800960653">
            Discord
          </Link>
        </div>
      </div>
    </header>
  );
}

function Screenshots() {
  const shots = [
    {src: 'calendar-week', alt: 'The family calendar in the Slate theme: a week of colour-coded events with meals at the top of each day and Halloween as a banner', caption: 'The family calendar'},
    {src: 'chores-schedule-week', alt: 'The chore schedule: this week day by day, with Overdue, Waiting for approval and Done badges', caption: 'Chore schedule'},
    {src: 'quick-add', alt: 'Quick Add: type one line and see what it will add', caption: 'Quick Add (beta)'},
    {src: 'right-now-top', alt: 'The calendar with the Right Now bar: who is home, what everyone is doing, and what is next', caption: 'The Right Now bar'},
    {src: 'rewards', alt: 'The Rewards card with star balances and a reward catalog', caption: 'Rewards'},
  ];
  return (
    <section className={styles.shots}>
      <div className="container">
        <figure className={styles.heroShot}>
          <img src={useBaseUrl('/img/screenshots/' + shots[0].src + '.webp')} alt={shots[0].alt} loading="eager" />
          <figcaption>{shots[0].caption} (demo household, made-up data)</figcaption>
        </figure>
        <div className={styles.shotRow}>
          {shots.slice(1).map((s) => (
            <figure key={s.src}>
              <img src={useBaseUrl('/img/screenshots/' + s.src + '.webp')} alt={s.alt} loading="lazy" />
              <figcaption>{s.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
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
        <Screenshots />
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
