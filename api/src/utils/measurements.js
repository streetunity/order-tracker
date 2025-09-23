// api/src/utils/measurements.js
// Utility to convert measurement values to proper types

export function parseMeasurementValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

export function prepareMeasurementData(data) {
  const prepared = {};
  
  if (data.height !== undefined) {
    prepared.height = parseMeasurementValue(data.height);
  }
  if (data.width !== undefined) {
    prepared.width = parseMeasurementValue(data.width);
  }
  if (data.length !== undefined) {
    prepared.length = parseMeasurementValue(data.length);
  }
  if (data.weight !== undefined) {
    prepared.weight = parseMeasurementValue(data.weight);
  }
  if (data.measurementUnit !== undefined) {
    prepared.measurementUnit = data.measurementUnit;
  }
  if (data.weightUnit !== undefined) {
    prepared.weightUnit = data.weightUnit;
  }
  
  return prepared;
}
