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

/** A label photo proves one product's figures. Attaching it to a second product
 * forges the proof token `visibleToUser` trusts, so the shared cache would
 * inherit nutrition nobody photographed. `ownerName` is null when the row
 * holding that photo is not one this user may be shown. */
export class LabelPhotoAlreadyUsedError extends Error {
  constructor(readonly ownerName: string | null) {
    super(
      ownerName === null
        ? "This label photo is already used by another product"
        : `This label photo is already used by ${ownerName}`,
    );
    this.name = "LabelPhotoAlreadyUsedError";
  }
}
