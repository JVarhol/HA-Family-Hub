// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    'intro',
    'installation',
    'requirements',
    {
      type: 'category',
      label: 'Features',
      link: {type: 'generated-index'},
      items: [
        'features/calendar-and-layout',
        'features/meal-planning',
        'features/grocy-integration',
        'features/chores-rewards-goals-routines',
        'features/timers-and-screen-saver',
        'features/reminders-and-countdown',
        'features/theming-and-more',
      ],
    },
    'card-configuration',
    'settings-modal',
    'notes',
    'roadmap',
    'changelog',
    'changelog-archive',
    'license',
  ],
};

export default sidebars;
