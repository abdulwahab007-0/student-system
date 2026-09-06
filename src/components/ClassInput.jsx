// ClassInput - free-form class field with suggestions.
// Lets the user type ANY class name manually while showing existing
// classes from the institution as suggestions (via <datalist>).
function ClassInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Type a class name e.g. BSCS',
  required = false,
  id,
  style
}) {
  const listId = id || 'class-suggestions';

  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        style={style}
      />
      <datalist id={listId}>
        {suggestions.map(cls => (
          <option key={cls} value={cls} />
        ))}
      </datalist>
    </>
  );
}

export default ClassInput;