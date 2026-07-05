from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Text

from app.db.database import Base


class ClientBranding(Base):
    """Letterhead settings for a client's self-generated print forms (invoices,
    KS-2/KS-3 acts) — logo, organization stamp+signature image, and free-form text.
    One row per client."""
    __tablename__ = "client_branding"

    client_id     = Column(String(200), ForeignKey("client_contacts.id", ondelete="CASCADE"),
                            primary_key=True)
    logo_path     = Column(String(300), nullable=True)  # relative path under UPLOAD_DIR
    logo_position = Column(String(20), nullable=False, default="top-left")  # top-left|top-center|top-right
    stamp_path    = Column(String(300), nullable=True)  # combined organization seal + signature image
    custom_text   = Column(Text, nullable=True)
    text_position = Column(String(20), nullable=False, default="footer")  # header|footer
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
