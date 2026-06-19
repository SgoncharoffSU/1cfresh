import logging
from email.message import EmailMessage

import aiosmtplib

from app.config import settings

logger = logging.getLogger(__name__)


async def send_invoice_email(
    to_email: str,
    client_name: str,
    invoice_number: str,
    amount: float,
    pdf_bytes: bytes,
) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg["Subject"] = f"Счет на оплату №{invoice_number}"
    msg.set_content(
        f"Уважаемый(ая) {client_name},\n\n"
        f"Направляем Вам счет на оплату №{invoice_number} "
        f"на сумму {amount:,.2f} руб.\n\n"
        f"Счет прилагается во вложении.\n\n"
        f"С уважением,\nБухгалтерия"
    )
    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=f"invoice_{invoice_number.replace('/', '_')}.pdf",
    )
    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=True,
        timeout=30,
    )
    logger.info("Email sent to %s for invoice %s", to_email, invoice_number)
