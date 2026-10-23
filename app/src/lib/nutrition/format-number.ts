// en-GB, not the runtime default: a server-rendered figure must match the one
// the browser hydrates with, and on every device ("2,320", never "2.320").
const NUMBER_FORMAT = new Intl.NumberFormat("en-GB");

export const formatNumber = (value: number): string => NUMBER_FORMAT.format(value);
