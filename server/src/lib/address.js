/** Campaigns that send a product need a shipping address. */
export const shipsProduct = (type) => type === 'barter' || type === 'hybrid';

export const hasAddress = (c) => !!(c?.address_street && c?.address_city);

/** One line, the way it goes on a package: "הרצל 12, דירה 4, תל אביב 6100000". */
export function formatAddress(c) {
  if (!hasAddress(c)) return '';
  return [c.address_street, c.address_apt, c.address_city, c.address_zip].filter(Boolean).join(', ');
}
