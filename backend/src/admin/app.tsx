import { Briefcase } from '@strapi/icons';
import type { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    locales: [],
  },
  register(app: StrapiApp) {
    app.addMenuLink({
      to: 'dofd-review',
      icon: Briefcase,
      intlLabel: {
        id: 'dofd-review.plugin.name',
        defaultMessage: 'DofD Review',
      },
      Component: () => import('./pages/DofdReview'),
      permissions: [],
      position: 2,
    });

    app.registerPlugin({
      id: 'dofd-review',
      name: 'DofD Review',
    });
  },
  bootstrap() {},
};
