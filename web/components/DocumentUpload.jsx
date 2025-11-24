"use client";

import ItemDocumentSection from "./ItemDocumentSection";
import "./DocumentUpload.css";

export default function DocumentUpload({ items, onDocumentChange }) {
  if (!items || items.length === 0) {
    return (
      <div className="documents-container">
        <div className="no-items-message">
          No items in this order. Add items to upload documents.
        </div>
      </div>
    );
  }

  return (
    <div className="documents-container">
      {items.map((item, index) => (
        <ItemDocumentSection
          key={item.id}
          item={item}
          defaultExpanded={false}
          onDocumentChange={onDocumentChange}
        />
      ))}
    </div>
  );
}
