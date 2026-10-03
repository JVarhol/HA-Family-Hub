import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Family Week Calendar',
    emoji: '🗓️',
    description: (
      <>
        A full-screen, tablet-friendly Week/Month calendar with per-person
        columns, meal planning, a recipe box, weather, and a Daily Digest
        &mdash; configured entirely from the in-card Settings panel.
      </>
    ),
  },
  {
    title: 'Chores, Rewards & Routines',
    emoji: '⭐',
    description: (
      <>
        Assignable, rotating, or first-come chores with a star economy, a
        redeemable rewards catalog, one-off goals, and Morning/Afternoon/Night
        routine checklists &mdash; gated by per-person permissions.
      </>
    ),
  },
  {
    title: 'Runs on Your Own Home Assistant',
    emoji: '🏠',
    description: (
      <>
        No cloud service, no subscription, no locked-down tablet. Family Hub
        is a real Home Assistant custom integration &mdash; your data stays
        on your own instance.
      </>
    ),
  },
];

function Feature({emoji, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <span className={styles.featureEmoji} role="img" aria-hidden="true">
          {emoji}
        </span>
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
