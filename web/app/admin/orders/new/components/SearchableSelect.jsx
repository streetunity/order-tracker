// Searchable Select Component
// A dropdown that allows typing to filter options

import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search or select...",
  displayKey = "name",
  valueKey = "id",
  required = false,
  style = {}
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Find the selected option to display its name
  const selectedOption = options.find(opt => String(opt[valueKey]) === String(value));
  
  // Filter options based on search term
  const filteredOptions = options.filter(opt => 
    opt[displayKey].toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        // Reset search term to show selected value when closing
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle input focus
  function handleFocus() {
    setIsOpen(true);
    setSearchTerm(""); // Clear to show all options when focusing
  }

  // Handle option selection
  function handleSelect(option) {
    onChange(option[valueKey]);
    setIsOpen(false);
    setSearchTerm("");
    inputRef.current?.blur();
  }

  // Handle input change
  function handleInputChange(e) {
    setSearchTerm(e.target.value);
    if (!isOpen) setIsOpen(true);
  }

  // Handle keyboard navigation
  function handleKeyDown(e) {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearchTerm("");
      inputRef.current?.blur();
    } else if (e.key === "Enter" && filteredOptions.length === 1) {
      e.preventDefault();
      handleSelect(filteredOptions[0]);
    }
  }

  // Clear selection
  function handleClear(e) {
    e.stopPropagation();
    onChange("");
    setSearchTerm("");
    inputRef.current?.focus();
  }

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }}>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          className="input"
          value={isOpen ? searchTerm : (selectedOption ? selectedOption[displayKey] : "")}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required && !value}
          style={{ 
            width: "100%",
            paddingRight: value ? "60px" : "30px"
          }}
        />
        {/* Clear button */}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: "absolute",
              right: "30px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "#9ca3af",
              cursor: "pointer",
              padding: "4px",
              fontSize: "14px",
              lineHeight: 1
            }}
            title="Clear selection"
          >
            ✕
          </button>
        )}
        {/* Dropdown arrow */}
        <span 
          onClick={() => {
            if (!isOpen) {
              inputRef.current?.focus();
            }
          }}
          style={{
            position: "absolute",
            right: "10px",
            top: "50%",
            transform: `translateY(-50%) rotate(${isOpen ? '180deg' : '0deg'})`,
            transition: "transform 0.2s",
            color: "#9ca3af",
            cursor: "pointer",
            fontSize: "12px"
          }}
        >
          ▼
        </span>
      </div>

      {/* Dropdown list */}
      {isOpen && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          marginTop: "4px",
          backgroundColor: "#1f1f1f",
          border: "1px solid #404040",
          borderRadius: "6px",
          maxHeight: "250px",
          overflowY: "auto",
          zIndex: 1000,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
        }}>
          {filteredOptions.length === 0 ? (
            <div style={{
              padding: "12px",
              color: "#9ca3af",
              textAlign: "center",
              fontSize: "14px"
            }}>
              No customers found
            </div>
          ) : (
            filteredOptions.map(option => (
              <div
                key={option[valueKey]}
                onClick={() => handleSelect(option)}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  backgroundColor: String(option[valueKey]) === String(value) ? "#3b3b3b" : "transparent",
                  color: String(option[valueKey]) === String(value) ? "#e4e4e4" : "#c0c0c0",
                  borderBottom: "1px solid #333",
                  transition: "background-color 0.15s"
                }}
                onMouseEnter={(e) => {
                  if (String(option[valueKey]) !== String(value)) {
                    e.target.style.backgroundColor = "#2d2d2d";
                  }
                }}
                onMouseLeave={(e) => {
                  if (String(option[valueKey]) !== String(value)) {
                    e.target.style.backgroundColor = "transparent";
                  }
                }}
              >
                {option[displayKey]}
              </div>
            ))
          )}
        </div>
      )}

      {/* Hidden input for form validation */}
      {required && (
        <input
          type="hidden"
          value={value || ""}
          required
        />
      )}
    </div>
  );
}
