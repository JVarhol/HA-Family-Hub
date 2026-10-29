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
        'features/quick-add',
        'features/meal-planning',
        'features/grocy-integration',
        'features/chores-rewards-goals-routines',
        'features/timers',
        'features/screen-saver',
        'features/reminders-and-countdown',
        'features/theming-and-more',
        'features/todo-lists-and-wishlists',
        'features/privacy-mode',
        'features/holiday-backgrounds',
        'features/automations-and-entities',
      ],
    },
    {
      type: 'category',
      label: 'Cards',
      link: {type: 'doc', id: 'card-configuration'},
      items: [
        'cards/family-week-calendar',
        'cards/family-today',
        'cards/right-now',
        'cards/chores',
        'cards/rewards',
        'cards/goals',
        'cards/todo-lists',
        'cards/recipe-box',
        'cards/my-pantry',
        'cards/active-timers',
        'cards/screen-saver',
        'cards/theme-selector',
      ],
    },
    'settings-modal',
    'integration-options',
    'notes',
    'changelog',
    'changelog-archive',
    'license',
  ],
};

export default sidebars;
