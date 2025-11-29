# Customer Documents Feature
## Order Tracker Enhancement Specification

**Document Version:** 1.0  
**Date:** November 28, 2025  
**Estimated Effort:** 2-3 hours  
**Priority:** Future Enhancement  

---

## Overview

Add the ability for admins and agents to upload documents that are visible to customers on their public tracking page (`/t/[token]`). Documents will have a title/description for easy identification and will be securely served via S3 signed URLs.

---

## User Stories

### As an Admin/Agent:
- I can upload documents to an order that customers can see
- I can provide a descriptive title so customers understand what the document is
- I can optionally categorize documents (Invoice, Shipping, Specs, Warranty, etc.)
- I can delete customer documents if uploaded in error
- I can see which documents have been uploaded for an order

### As a Customer:
- I can see all documents uploaded for my order on my tracking page
- I can easily understand what each document is via the title
- I can download documents securely
- Documents are organized and easy to navigate

---

## Database Schema

### New Table: CustomerDocument

```prisma
model CustomerDocument {
  id              String    @id @default(uuid())
  orderId         String
  order           Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  
  // Display Information
  title           String    // Required - "Bill of Lading - Container MSCU1234567"
  category        String?   // Optional - "INVOICE", "SHIPPING", "SPECS", "WARRANTY", "MANUAL", "OTHER"
  
  // File Information
  fileName        String    // Original filename
  fileType        String    // MIME type
  fileSize        Int       // Bytes
  s3Key           String    // S3 object key
  
  // Tracking
  uploadedById    String
  uploadedBy      User      @relation(fields: [uploadedById], references: [id])
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

### Update Order Model

Add relation to Order model:

```prisma
model Order {
  // ... existing fields
  
  customerDocuments CustomerDocument[]
}
```

---

## API Endpoints

### 1. Upload Customer Document

**Endpoint:** `POST /api/orders/:orderId/customer-documents`

**Auth:** Required (ADMIN, AGENT, SUPER_ADMIN, ACCOUNTANT)

**Request:** `multipart/form-data`
- `file` - The document file
- `title` - Document title (required)
- `category` - Optional category

**Response:**
```json
{
  "id": "uuid",
  "title": "Bill of Lading - Container MSCU1234567",
  "category": "SHIPPING",
  "fileName": "bol-mscu1234567.pdf",
  "fileType": "application/pdf",
  "fileSize": 245632,
  "createdAt": "2025-11-28T12:00:00Z",
  "uploadedBy": {
    "id": "user-uuid",
    "name": "John Smith"
  }
}
```

### 2. List Customer Documents (Admin/Agent)

**Endpoint:** `GET /api/orders/:orderId/customer-documents`

**Auth:** Required (ADMIN, AGENT, SUPER_ADMIN, ACCOUNTANT)

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "title": "Bill of Lading - Container MSCU1234567",
      "category": "SHIPPING",
      "fileName": "bol-mscu1234567.pdf",
      "fileType": "application/pdf",
      "fileSize": 245632,
      "createdAt": "2025-11-28T12:00:00Z",
      "uploadedBy": {
        "id": "user-uuid",
        "name": "John Smith"
      }
    }
  ]
}
```

### 3. Delete Customer Document

**Endpoint:** `DELETE /api/orders/:orderId/customer-documents/:documentId`

**Auth:** Required (ADMIN, AGENT, SUPER_ADMIN, ACCOUNTANT)

**Response:**
```json
{
  "success": true,
  "message": "Document deleted"
}
```

### 4. Download Customer Document (Signed URL)

**Endpoint:** `GET /api/orders/:orderId/customer-documents/:documentId/download`

**Auth:** Required (ADMIN, AGENT, SUPER_ADMIN, ACCOUNTANT) OR valid public token

**Response:**
```json
{
  "downloadUrl": "https://s3.amazonaws.com/bucket/key?signed-params...",
  "expiresIn": 3600
}
```

### 5. Public Customer Documents (for tracking page)

**Endpoint:** `GET /api/public/orders/:token/documents`

**Auth:** None (uses order token)

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "title": "Bill of Lading - Container MSCU1234567",
      "category": "SHIPPING",
      "fileName": "bol-mscu1234567.pdf",
      "fileSize": 245632,
      "createdAt": "2025-11-28T12:00:00Z"
    }
  ]
}
```

---

## Backend Implementation

### New Route File: `api/src/routes/customerDocuments.js`

```javascript
import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authGuard } from '../middleware/auth.js';
import { uploadFileToS3, deleteFileFromS3, getSignedDownloadUrl } from '../services/fileUploadService.js';

const prisma = new PrismaClient();
const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Upload customer document
router.post('/orders/:orderId/customer-documents', authGuard, upload.single('file'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { title, category } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Document title is required' });
    }

    // Verify order exists and user has access
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check agent access (agents can only upload to their own orders)
    if (req.user.role === 'AGENT' && order.sku !== req.user.username) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Upload to S3 with customer-documents prefix
    const s3Result = await uploadFileToS3({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      orderId,
      uploadedBy: req.user.id,
      pathPrefix: 'customer-documents'
    });

    // Create database record
    const document = await prisma.customerDocument.create({
      data: {
        orderId,
        title: title.trim(),
        category: category || null,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        s3Key: s3Result.s3Key,
        uploadedById: req.user.id
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true }
        }
      }
    });

    res.status(201).json(document);
  } catch (error) {
    console.error('Error uploading customer document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// List customer documents for an order
router.get('/orders/:orderId/customer-documents', authGuard, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Verify order exists
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check agent access
    if (req.user.role === 'AGENT' && order.sku !== req.user.username) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const documents = await prisma.customerDocument.findMany({
      where: { orderId },
      include: {
        uploadedBy: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ documents });
  } catch (error) {
    console.error('Error listing customer documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// Delete customer document
router.delete('/orders/:orderId/customer-documents/:documentId', authGuard, async (req, res) => {
  try {
    const { orderId, documentId } = req.params;

    const document = await prisma.customerDocument.findFirst({
      where: { id: documentId, orderId }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check agent access
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (req.user.role === 'AGENT' && order.sku !== req.user.username) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete from S3
    await deleteFileFromS3(document.s3Key);

    // Delete from database
    await prisma.customerDocument.delete({ where: { id: documentId } });

    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('Error deleting customer document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Get download URL (authenticated)
router.get('/orders/:orderId/customer-documents/:documentId/download', authGuard, async (req, res) => {
  try {
    const { orderId, documentId } = req.params;

    const document = await prisma.customerDocument.findFirst({
      where: { id: documentId, orderId }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const downloadUrl = await getSignedDownloadUrl(document.s3Key);

    res.json({ downloadUrl, expiresIn: 3600 });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

export default router;
```

### Update Public Route: `api/src/routes/public.js`

Add to the existing public order endpoint to include customer documents:

```javascript
// In the public order fetch, include customer documents
const order = await prisma.order.findUnique({
  where: { trackingToken: token },
  include: {
    // ... existing includes
    customerDocuments: {
      select: {
        id: true,
        title: true,
        category: true,
        fileName: true,
        fileSize: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    }
  }
});
```

Add public download endpoint:

```javascript
// Public document download (using tracking token)
router.get('/orders/:token/documents/:documentId/download', async (req, res) => {
  try {
    const { token, documentId } = req.params;

    // Verify token is valid
    const order = await prisma.order.findUnique({
      where: { trackingToken: token }
    });

    if (!order) {
      return res.status(404).json({ error: 'Invalid tracking link' });
    }

    // Get document
    const document = await prisma.customerDocument.findFirst({
      where: { id: documentId, orderId: order.id }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const downloadUrl = await getSignedDownloadUrl(document.s3Key);

    res.json({ downloadUrl, expiresIn: 3600 });
  } catch (error) {
    console.error('Error generating public download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});
```

---

## Frontend Implementation

### 1. Customer View (Public Tracking Page)

Add to `/web/app/t/[token]/page.jsx` after the Shipping Information section:

```jsx
{/* Customer Documents Section */}
{order.customerDocuments && order.customerDocuments.length > 0 && (
  <div style={{ 
    padding: "20px",
    backgroundColor: "#2d2d2d",
    borderRadius: "8px",
    border: "1px solid #404040",
    marginBottom: "40px",
    width: "100%",
    boxSizing: "border-box"
  }}>
    <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4", marginBottom: "16px" }}>
      📄 Your Documents
    </h3>
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {order.customerDocuments.map((doc) => (
        <div
          key={doc.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px",
            backgroundColor: "#1a1a1a",
            borderRadius: "6px",
            border: "1px solid #404040"
          }}
        >
          <div>
            <div style={{ color: "#e4e4e4", fontWeight: "500", fontSize: "15px" }}>
              {doc.title}
            </div>
            <div style={{ color: "#a0a0a0", fontSize: "12px", marginTop: "4px" }}>
              {formatDateOnly(doc.createdAt)} • {formatFileSize(doc.fileSize)}
            </div>
          </div>
          <button
            onClick={() => handleDownload(doc.id)}
            style={{
              padding: "8px 16px",
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500"
            }}
          >
            Download
          </button>
        </div>
      ))}
    </div>
  </div>
)}
```

Add helper functions:

```jsx
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const handleDownload = async (documentId) => {
  try {
    const res = await fetch(`/api/public/orders/${params.token}/documents/${documentId}/download`);
    if (!res.ok) throw new Error('Failed to get download link');
    const { downloadUrl } = await res.json();
    window.open(downloadUrl, '_blank');
  } catch (error) {
    console.error('Download error:', error);
    alert('Failed to download document');
  }
};
```

### 2. Admin/Agent Upload UI

Add to order details page, in the Documents tab:

```jsx
{/* Customer Documents Section */}
<div style={{ marginTop: "24px" }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
    <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#e4e4e4" }}>
      Customer Documents
    </h3>
    <button
      onClick={() => setShowCustomerDocUpload(true)}
      style={{
        padding: "8px 16px",
        backgroundColor: "#dc2626",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "14px"
      }}
    >
      + Upload Document
    </button>
  </div>
  
  <p style={{ color: "#a0a0a0", fontSize: "14px", marginBottom: "16px" }}>
    Documents uploaded here will be visible to the customer on their tracking page.
  </p>
  
  {/* Document list */}
  {customerDocuments.length === 0 ? (
    <div style={{ color: "#6b7280", fontStyle: "italic" }}>
      No customer documents uploaded yet.
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {customerDocuments.map((doc) => (
        <div
          key={doc.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            backgroundColor: "#1a1a1a",
            borderRadius: "6px",
            border: "1px solid #404040"
          }}
        >
          <div>
            <div style={{ color: "#e4e4e4", fontWeight: "500" }}>{doc.title}</div>
            <div style={{ color: "#a0a0a0", fontSize: "12px", marginTop: "2px" }}>
              {doc.fileName} • {formatFileSize(doc.fileSize)} • Uploaded by {doc.uploadedBy.name}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => handleDownload(doc.id)} style={buttonStyle}>
              Download
            </button>
            <button onClick={() => handleDelete(doc.id)} style={deleteButtonStyle}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )}
</div>

{/* Upload Modal */}
{showCustomerDocUpload && (
  <div style={modalOverlayStyle}>
    <div style={modalStyle}>
      <h3 style={{ color: "#e4e4e4", marginBottom: "16px" }}>Upload Customer Document</h3>
      
      <div style={{ marginBottom: "16px" }}>
        <label style={{ color: "#a0a0a0", fontSize: "14px", display: "block", marginBottom: "4px" }}>
          Document Title *
        </label>
        <input
          type="text"
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          placeholder="e.g., Bill of Lading - Container MSCU1234567"
          style={inputStyle}
        />
        <p style={{ color: "#6b7280", fontSize: "12px", marginTop: "4px" }}>
          This is what the customer will see. Be descriptive.
        </p>
      </div>
      
      <div style={{ marginBottom: "16px" }}>
        <label style={{ color: "#a0a0a0", fontSize: "14px", display: "block", marginBottom: "4px" }}>
          Category (Optional)
        </label>
        <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)} style={selectStyle}>
          <option value="">Select category...</option>
          <option value="INVOICE">Invoice</option>
          <option value="SHIPPING">Shipping Document</option>
          <option value="SPECS">Specifications</option>
          <option value="WARRANTY">Warranty</option>
          <option value="MANUAL">Manual</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      
      <div style={{ marginBottom: "24px" }}>
        <label style={{ color: "#a0a0a0", fontSize: "14px", display: "block", marginBottom: "4px" }}>
          File *
        </label>
        <input
          type="file"
          onChange={(e) => setDocFile(e.target.files[0])}
          style={{ color: "#e4e4e4" }}
        />
      </div>
      
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
        <button onClick={() => setShowCustomerDocUpload(false)} style={cancelButtonStyle}>
          Cancel
        </button>
        <button onClick={handleUploadCustomerDoc} disabled={uploading} style={submitButtonStyle}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
    </div>
  </div>
)}
```

---

## Document Categories

| Category | Description | Examples |
|----------|-------------|----------|
| INVOICE | Billing documents | Invoice, Receipt |
| SHIPPING | Shipping paperwork | Bill of Lading, Packing List |
| SPECS | Technical specifications | Product specs, Drawings |
| WARRANTY | Warranty documents | Warranty certificate |
| MANUAL | User manuals | Operation manual, Setup guide |
| OTHER | Miscellaneous | Any other document |

---

## S3 Storage Structure

```
order-tracker-documents/
├── orders/
│   └── {orderId}/
│       └── {timestamp}-{uuid}.{ext}    # Internal documents (existing)
└── customer-documents/
    └── {orderId}/
        └── {timestamp}-{uuid}.{ext}    # Customer-visible documents
```

---

## Permissions Matrix

| Role | Upload | View | Delete | Download |
|------|--------|------|--------|----------|
| SUPER_ADMIN | ✅ All orders | ✅ All | ✅ All | ✅ All |
| ADMIN | ✅ All orders | ✅ All | ✅ All | ✅ All |
| ACCOUNTANT | ✅ All orders | ✅ All | ✅ All | ✅ All |
| AGENT | ✅ Own orders only | ✅ Own | ✅ Own | ✅ Own |
| MANUFACTURER | ❌ | ❌ | ❌ | ❌ |
| BROKER | ❌ | ❌ | ❌ | ❌ |
| Customer (public) | ❌ | ✅ Via token | ❌ | ✅ Via token |

---

## Testing Checklist

- [ ] Admin can upload document with title
- [ ] Agent can upload document to their own order
- [ ] Agent cannot upload to other agents' orders
- [ ] Document appears in order details page
- [ ] Document appears on customer tracking page
- [ ] Customer can download via tracking link
- [ ] Admin can delete document
- [ ] S3 file is deleted when document is deleted
- [ ] File size limit enforced
- [ ] Invalid file types rejected
- [ ] Empty title rejected

---

## Migration Steps

1. Add `CustomerDocument` model to `schema.prisma`
2. Run `npx prisma db push` to update database
3. Create `customerDocuments.js` route file
4. Register route in `index.js`
5. Update public routes to include customer documents
6. Update customer tracking page frontend
7. Add upload UI to order details page
8. Test all scenarios
9. Deploy

---

## Future Enhancements

- **Email notification** when new document is uploaded
- **Document versioning** (replace document, keep history)
- **Bulk upload** multiple documents at once
- **Document templates** (pre-filled titles for common documents)
- **Expiring documents** (auto-hide after X days)
- **View tracking** (track when customer viewed/downloaded)

---

**Document Status:** Ready for Implementation  
**Dependencies:** Existing S3 upload service, existing auth middleware  
**Breaking Changes:** None (additive feature)
