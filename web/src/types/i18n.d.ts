import "i18next";
import type common from "../locales/en/common.json";
import type landing from "../locales/en/landing.json";
import type docs from "../locales/en/docs.json";
import type fold from "../locales/en/fold.json";
import type errors from "../locales/en/errors.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      landing: typeof landing;
      docs: typeof docs;
      fold: typeof fold;
      errors: typeof errors;
    };
  }
}
