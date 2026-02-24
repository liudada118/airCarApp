export const garyColors = Array.from({length: 32}, (_, index) => {
  const value = Math.round((index / 31) * 255);
  return [value, value, value];
});
