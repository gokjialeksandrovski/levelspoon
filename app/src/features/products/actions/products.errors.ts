export class BarcodeAlreadyLinkedError extends Error {
  constructor(barcode: string) {
    super(`Barcode ${barcode} is already linked to another product`);
    this.name = "BarcodeAlreadyLinkedError";
  }
}

export class ProductNotEditableError extends Error {
  constructor(productId: string) {
    super(`Product ${productId} is not an editable user product`);
    this.name = "ProductNotEditableError";
  }
}
