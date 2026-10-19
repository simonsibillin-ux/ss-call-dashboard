export function calendarLocation(address, suburb) {
  const street = String(address || "").trim();
  const area = String(suburb || "").trim();
  if (!street) return area;
  if (!area || street.toLowerCase().includes(area.toLowerCase())) return street;
  return `${street}, ${area}`;
}
