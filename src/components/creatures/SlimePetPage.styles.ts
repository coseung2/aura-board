import coreStyles from "./SlimePetPage.core.module.css";
import dialogStyles from "./SlimePetPage.dialogs.module.css";
import shopStyles from "./SlimePetPage.shop.module.css";
import wardrobeStyles from "./SlimePetPage.wardrobe.module.css";

type CssModule = Record<string, string>;

const modules: CssModule[] = [
  coreStyles,
  shopStyles,
  dialogStyles,
  wardrobeStyles,
];

/**
 * The pet screen is split into bounded CSS modules to keep each source file
 * maintainable. Components need one class map, including every generated class
 * when a selector is intentionally continued in more than one module.
 */
export const styles: CssModule = new Proxy<CssModule>({} as CssModule, {
  get(_target, property) {
    if (typeof property !== "string") return undefined;
    return modules
      .map((moduleStyles) => moduleStyles[property])
      .filter(Boolean)
      .join(" ");
  },
});
