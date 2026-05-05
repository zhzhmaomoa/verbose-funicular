// Converts a numeric rating into a compact visual string.
export function createRatingText(rating) {
  return `${rating.toFixed(1)} / 5.0`;
}

// Builds stars from plain text so Web Components can render without extra dependencies.
export function createStars(rating) {
  const fullStars = Math.round(rating);
  return '★★★★★'
    .split('')
    .map((star, index) => (index < fullStars ? star : '☆'))
    .join('');
}
