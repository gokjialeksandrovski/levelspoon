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
 * `product` never survives a Server Action's throw back to the client - Next
 * only forwards `name`/`message`/`digest` across that boundary, dropping every
 * other own property (confirmed empirically: an instance thrown from
 * `createProduct` and caught in a client component logs `Object.keys(error)`
 * as `["name", "environmentName", "digest"]`, with `product` gone entirely).
 * The suffix is exported so the confirm step can recover the name by trimming
 * it off `error.message`, the one channel that does survive. */
export const DUPLICATE_PRODUCT_SUFFIX = " already has these figures";

export class DuplicateProductError extends Error {
  constructor(readonly product: { id: string; name: string }) {
    super(`${product.name}${DUPLICATE_PRODUCT_SUFFIX}`);
    this.name = "DuplicateProductError";
  }
}

/** Identical figures under a name nothing like the row that holds them: the
 * likely borrowed label, but also how every brand of water legitimately reads.
 * Cleared by `acknowledgedSameFigures`, never by the caller alone.
 *
 * Same cross-boundary loss as `DuplicateProductError` above: `ownerName` never
 * reaches the client's catch block, only `message` does. Exported alongside
 * the generic-owner placeholder so the confirm step can parse the real name
 * back out, or recognise the placeholder and fall back to the generic prompt. */
export const SAME_FIGURES_GENERIC_OWNER = "Another product";
export const SAME_FIGURES_SUFFIX = " already has these exact figures";

export class SameFiguresError extends Error {
  constructor(readonly ownerName: string | null) {
    super(`${ownerName ?? SAME_FIGURES_GENERIC_OWNER}${SAME_FIGURES_SUFFIX}`);
    this.name = "SameFiguresError";
  }
}
