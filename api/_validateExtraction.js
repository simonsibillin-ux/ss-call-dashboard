/**
 * SS Exterior Services — AI Extraction Validator
 *
 * Validates raw model output before it touches the frontend or calcQuote.
 * Returns a clean, typed ExtractionResult or throws with a clear message.
 *
 * Rules:
 * - Every serviceKey must exist in SERVICE_CATALOGUE
 * - Every answer field must be permitted for that service
 * - Enumerated values must be valid
 * - Numbers must be numbers
 * - No pricing/financial fields allowed anywhere in the output
 * - Unknown top-level fields are stripped (not rejected) with a warning
 */

const { SERVICE_CATALOGUE, VALID_SERVICE_KEYS, FORBIDDEN_FIELDS } = require('./_serviceCatalogue');

/**
 * Main validation entry point.
 * @param {any} raw - Parsed JSON from the model (or already-parsed tool_use input)
 * @returns {{ result: ExtractionResult, validationWarnings: string[] }}
 */
function validateExtraction(raw) {
  const warnings = [];

  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('AI response was not a valid object', 'INVALID_STRUCTURE');
  }

  // Check for forbidden financial fields anywhere in the raw object
  checkForForbiddenFields(raw, warnings, '$root');

  const result = {
    customer: validateCustomer(raw.customer, warnings),
    property: validateProperty(raw.property, warnings),
    services: validateServices(raw.services, warnings),
    customerConcerns: validateStringArray(raw.customerConcerns, 'customerConcerns', warnings),
    internalNotes: validateStringArray(raw.internalNotes, 'internalNotes', warnings),
    assumptions: validateStringArray(raw.assumptions, 'assumptions', warnings),
    warnings: validateStringArray(raw.warnings, 'warnings', warnings),
    unsupportedRequests: validateStringArray(raw.unsupportedRequests, 'unsupportedRequests', warnings)
  };

  return { result, validationWarnings: warnings };
}

function validateCustomer(customer, warnings) {
  if (!customer || typeof customer !== 'object') {
    if (customer !== null && customer !== undefined) {
      warnings.push('customer field was not an object — replaced with empty customer');
    }
    return { name: null, phone: null, email: null };
  }
  return {
    name: nullableString(customer.name, 'customer.name', warnings),
    phone: nullableString(customer.phone, 'customer.phone', warnings),
    email: nullableString(customer.email, 'customer.email', warnings)
  };
}

function validateProperty(property, warnings) {
  if (!property || typeof property !== 'object') {
    if (property !== null && property !== undefined) {
      warnings.push('property field was not an object — replaced with empty property');
    }
    return { address: null, suburb: null };
  }
  return {
    address: nullableString(property.address, 'property.address', warnings),
    suburb: nullableString(property.suburb, 'property.suburb', warnings)
  };
}

function validateServices(services, warnings) {
  if (!Array.isArray(services)) {
    if (services !== null && services !== undefined) {
      warnings.push('services field was not an array — replaced with empty array');
    }
    return [];
  }

  const validated = [];
  services.forEach((svc, idx) => {
    const prefix = `services[${idx}]`;
    if (!svc || typeof svc !== 'object') {
      warnings.push(`${prefix} was not an object — skipped`);
      return;
    }

    const serviceKey = svc.serviceKey;
    if (!serviceKey || typeof serviceKey !== 'string') {
      warnings.push(`${prefix}.serviceKey missing or not a string — service skipped`);
      return;
    }
    if (!VALID_SERVICE_KEYS.includes(serviceKey)) {
      warnings.push(`${prefix}.serviceKey "${serviceKey}" is not a recognised service — service skipped. Valid keys: ${VALID_SERVICE_KEYS.join(', ')}`);
      return;
    }

    const catalogue = SERVICE_CATALOGUE[serviceKey];
    const validatedAnswers = validateAnswers(svc.answers, serviceKey, catalogue, warnings, `${prefix}.answers`);
    const missingRequired = findMissingFields(validatedAnswers, catalogue.requiredForPricing, prefix);
    const missingRecommended = findMissingFields(validatedAnswers, catalogue.recommendedForPricing, prefix);

    // Validate confidence object (strip non-numeric values)
    const confidence = validateConfidence(svc.confidence, prefix, warnings);

    // Validate evidence object (string values only)
    const evidence = validateEvidence(svc.evidence, prefix, warnings);

    // Validate suggested questions (string array)
    const suggestedQuestions = validateStringArray(svc.suggestedQuestions, `${prefix}.suggestedQuestions`, warnings);

    // Check for escalation triggers
    const escalations = checkEscalationTriggers(validatedAnswers, catalogue, serviceKey);

    validated.push({
      serviceKey,
      displayName: catalogue.displayName,
      answers: validatedAnswers,
      scopeNotes: nullableString(svc.scopeNotes, `${prefix}.scopeNotes`, warnings) || '',
      confidence,
      evidence,
      missingRequiredFields: missingRequired,
      missingRecommendedFields: missingRecommended,
      suggestedQuestions,
      escalations,
      readyForPricing: missingRequired.length === 0 && escalations.length === 0
    });
  });

  return validated;
}

function validateAnswers(answers, serviceKey, catalogue, warnings, prefix) {
  if (!answers || typeof answers !== 'object') {
    if (answers !== null && answers !== undefined) {
      warnings.push(`${prefix} was not an object — replaced with empty answers`);
    }
    return {};
  }

  const allowedFields = Object.keys(catalogue.fields);
  const validated = {};

  Object.entries(answers).forEach(([field, value]) => {
    // Block forbidden financial fields
    if (FORBIDDEN_FIELDS.includes(field.toLowerCase())) {
      warnings.push(`${prefix}.${field} is a forbidden financial field — removed`);
      return;
    }

    // Block unknown fields
    if (!allowedFields.includes(field)) {
      warnings.push(`${prefix}.${field} is not a recognised field for service "${serviceKey}" — removed`);
      return;
    }

    const fieldSpec = catalogue.fields[field];

    // Null is always acceptable (means "not yet known")
    if (value === null || value === undefined) {
      validated[field] = null;
      return;
    }

    // Validate by type
    if (fieldSpec.type === 'enum') {
      if (!fieldSpec.allowedValues.includes(value)) {
        warnings.push(`${prefix}.${field} value "${value}" is not in allowed values [${fieldSpec.allowedValues.join(', ')}] — set to null`);
        validated[field] = null;
      } else {
        validated[field] = value;
      }
    } else if (fieldSpec.type === 'number') {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        warnings.push(`${prefix}.${field} value "${value}" is not a valid positive number — set to null`);
        validated[field] = null;
      } else {
        validated[field] = num;
      }
    } else if (fieldSpec.type === 'string') {
      if (typeof value !== 'string') {
        warnings.push(`${prefix}.${field} expected string, got ${typeof value} — converted`);
        validated[field] = String(value);
      } else {
        validated[field] = value;
      }
    } else if (fieldSpec.type === 'array') {
      if (!Array.isArray(value)) {
        warnings.push(`${prefix}.${field} expected array, got ${typeof value} — set to []`);
        validated[field] = [];
      } else {
        // Validate each item in the array against itemSchema
        validated[field] = value
          .filter((item, i) => {
            if (!item || typeof item !== 'object') {
              warnings.push(`${prefix}.${field}[${i}] was not an object — skipped`);
              return false;
            }
            return true;
          })
          .map((item, i) => {
            const cleanItem = {};
            if (fieldSpec.itemSchema) {
              Object.entries(fieldSpec.itemSchema).forEach(([subField, subSpec]) => {
                const subVal = item[subField];
                if (subVal === null || subVal === undefined) {
                  cleanItem[subField] = null;
                } else if (subSpec.type === 'enum') {
                  if (!subSpec.allowedValues.includes(subVal)) {
                    warnings.push(`${prefix}.${field}[${i}].${subField} value "${subVal}" not allowed — set to null`);
                    cleanItem[subField] = null;
                  } else {
                    cleanItem[subField] = subVal;
                  }
                } else {
                  cleanItem[subField] = subVal;
                }
              });
            }
            return cleanItem;
          });
      }
    }
  });

  return validated;
}

function validateConfidence(confidence, prefix, warnings) {
  if (!confidence || typeof confidence !== 'object' || Array.isArray(confidence)) return {};
  const clean = {};
  Object.entries(confidence).forEach(([field, val]) => {
    const num = Number(val);
    if (isNaN(num) || num < 0 || num > 1) {
      warnings.push(`${prefix}.confidence.${field} value "${val}" must be 0–1 — removed`);
    } else {
      clean[field] = num;
    }
  });
  return clean;
}

function validateEvidence(evidence, prefix, warnings) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return {};
  const clean = {};
  Object.entries(evidence).forEach(([field, val]) => {
    if (typeof val !== 'string') {
      warnings.push(`${prefix}.evidence.${field} must be a string — converted`);
      clean[field] = String(val);
    } else {
      clean[field] = val;
    }
  });
  return clean;
}

function findMissingFields(answers, requiredFields, prefix) {
  return requiredFields.filter(field => {
    const val = answers[field];
    return val === null || val === undefined;
  });
}

function checkEscalationTriggers(answers, catalogue, serviceKey) {
  const triggered = [];
  (catalogue.escalationTriggers || []).forEach(trigger => {
    if (answers[trigger.field] === trigger.value) {
      triggered.push({ field: trigger.field, value: trigger.value, action: trigger.action });
    }
  });
  return triggered;
}

function validateStringArray(arr, path, warnings) {
  if (arr === null || arr === undefined) return [];
  if (!Array.isArray(arr)) {
    warnings.push(`${path} was not an array — replaced with []`);
    return [];
  }
  return arr
    .map((item, i) => {
      if (typeof item !== 'string') {
        warnings.push(`${path}[${i}] was not a string — converted`);
        return String(item);
      }
      return item;
    })
    .filter(s => s.length > 0);
}

function nullableString(val, path, warnings) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') {
    warnings.push(`${path} expected string — converted`);
    return String(val);
  }
  return val.trim() || null;
}

function checkForForbiddenFields(obj, warnings, path) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => checkForForbiddenFields(item, warnings, `${path}[${i}]`));
    return;
  }
  Object.keys(obj).forEach(key => {
    if (FORBIDDEN_FIELDS.includes(key.toLowerCase())) {
      warnings.push(`Forbidden financial field "${key}" found at ${path}.${key} — removed from output`);
    }
    checkForForbiddenFields(obj[key], warnings, `${path}.${key}`);
  });
}

class ValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

module.exports = { validateExtraction, ValidationError };
