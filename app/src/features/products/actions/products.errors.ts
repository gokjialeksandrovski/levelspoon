/** A second user's scan/OFF-save won the race for this barcode between
 * `createProduct`'s own pre-check and its insert. `createProduct` catches this
 * at its own boundary and maps it to `CreateProductResult`'s `barcode_conflict`
 * arm - same reasoning as `DuplicateProductError` below: a client component
 * catching a Server Action's throw never sees this class, only a generic
 * `Error` with `name`/`message`/`digest`, so `instanceof` only works while the
 * throw stays inside this module. */
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

/** The row per100 already holds for this product. Carried rather than just
 * named, because the only useful next step is logging that product instead of
 * filing a second one for it.
 *
 * Thrown only within `products.ts` - `createProduct` catches it at its own
 * boundary and maps it to `CreateProductResult`'s `duplicate_product` arm,
 * because a Server Action's thrown error does not survive the trip back to a
 * client component with its subclass identity or its own properties intact
 * (confirmed empirically: only `name`/`message`/`digest` cross that boundary).
 * `instanceof` stays reliable here because nothing outside this module ever
 * sees the throw. */
export class DuplicateProductError extends Error {
  constructor(readonly product: { id: string; name: string }) {
    super(`${product.name} already has these figures`);
    this.name = "DuplicateProductError";
  }
}

/** Identical figures under a name nothing like the row that holds them: the
 * likely borrowed label, but also how every brand of water legitimately reads.
 * Cleared by `acknowledgedSameFigures`, never by the caller alone.
 *
 * Same internal-only contract as `DuplicateProductError` above - caught and
 * mapped to `CreateProductResult`'s `same_figures` arm inside `createProduct`,
 * never thrown across the Server Action boundary. */
export class SameFiguresError extends Error {
  constructor(readonly ownerName: string | null) {
    super(
      ownerName === null
        ? "Another product already has these exact figures"
        : `${ownerName} already has these exact figures`,
    );
    this.name = "SameFiguresError";
  }
}
