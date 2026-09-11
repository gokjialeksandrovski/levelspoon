export class ProductNotEditableError extends Error {
  constructor(productId: string) {
    super(`Product ${productId} is not an editable user product`);
    this.name = "ProductNotEditableError";
  }
}
