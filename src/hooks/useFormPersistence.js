import { useState, useEffect } from 'react'

export function useFormPersistence(formKey, initialValues) {
  const [values, setValues] = useState(() => {
    try {
      const stored = localStorage.getItem(`form_${formKey}`)
      return stored ? { ...initialValues, ...JSON.parse(stored) } : initialValues
    } catch {
      return initialValues
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(`form_${formKey}`, JSON.stringify(values))
    } catch {}
  }, [formKey, values])

  const updateField = (field, value) => {
    setValues(prev => ({ ...prev, [field]: value }))
  }

  const clearForm = () => {
    localStorage.removeItem(`form_${formKey}`)
    setValues(initialValues)
  }

  return { values, updateField, clearForm }
}
