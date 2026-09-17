import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams) => ({
  triggerEndpoint: env('YOXA_TRIGGER_ENDPOINT'),
  deploymentSecret: env('YOXA_DEPLOYMENT_SECRET'),
  triggerTextPrefix: env('YOXA_TRIGGER_TEXT_PREFIX', 'Submitted external form'),
  toolApiKey: env('YOXA_TOOL_API_KEY'),
});

export default config;
