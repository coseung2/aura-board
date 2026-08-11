-- Feed posts may intentionally contain only images or a YouTube item.
-- Cross-table media existence cannot be expressed as a row CHECK constraint;
-- the server validation + create transaction enforce at least one content element.
ALTER TABLE "FeedPost" DROP CONSTRAINT "FeedPost_content_check";
