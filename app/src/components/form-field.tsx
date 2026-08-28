// app/src/components/form-field.tsx
interface FormFieldProps {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}

export const FormField = ({ label, name, type = "text", defaultValue, required = false }: FormFieldProps) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={name} className="text-sm font-medium text-gray-700">
      {label}
    </label>
    <input
      id={name}
      name={name}
      type={type}
      defaultValue={defaultValue}
      required={required}
      className="rounded border border-gray-300 px-3 py-2"
    />
  </div>
);
