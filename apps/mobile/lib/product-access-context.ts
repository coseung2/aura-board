import { createContext, useContext } from "react";
import type { ProductAccess } from "./product-access";

export const ProductAccessContext = createContext<ProductAccess | null>(null);
export function useProductAccess() {
  return useContext(ProductAccessContext);
}
